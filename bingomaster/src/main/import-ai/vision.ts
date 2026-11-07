/**
 * Único módulo con acceso a internet: envía la foto a la API de Claude desde
 * el proceso main con el SDK oficial (@anthropic-ai/sdk).
 */
import Anthropic from '@anthropic-ai/sdk';
import type { Result } from '../../shared/ipc/contract';
import {
  combineReadings, parseReading, READING_SCHEMA, readingPrompt, ReadingError, MAX_CARDS_PER_PHOTO, type RawCard, type ReviewedCard,
} from '../../shared/import-ai/reading';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/** Modelos que aceptan `fallbacks: "default"` (reintento server-side si un clasificador rechaza). */
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5']);

export function buildRequest(model: string, base64: string, mediaType: string, expected: number | null) {
  if (!base64) throw new ReadingError('entrada', 'Falta la imagen');
  if (!IMAGE_TYPES.has(mediaType)) throw new ReadingError('entrada', `Formato de imagen no soportado: ${mediaType}`);
  const exp = expected && expected >= 1 && expected <= MAX_CARDS_PER_PHOTO ? expected : null;
  const params = {
    model,
    max_tokens: 16000,
    output_config: { effort: 'high' as const, format: { type: 'json_schema' as const, schema: READING_SCHEMA as unknown as Record<string, unknown> } },
    messages: [
      {
        role: 'user' as const,
        content: [
          { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType as 'image/jpeg', data: base64 } },
          { type: 'text' as const, text: readingPrompt(exp) },
        ],
      },
    ],
    ...(FALLBACK_MODELS.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
  };
  return params;
}

function textOf(resp: { stop_reason: string | null; content: { type: string; text?: string }[] }): string {
  if (resp.stop_reason === 'refusal') throw new ReadingError('rechazo', 'El modelo rechazó la petición. Use el ingreso manual.');
  if (resp.stop_reason === 'max_tokens') throw new ReadingError('truncada', 'La respuesta quedó incompleta.');
  return resp.content.filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('');
}

function classify(err: unknown): { code: string; error: string } {
  if (err instanceof ReadingError) return { code: err.code, error: err.message };
  if (err instanceof Anthropic.AuthenticationError) return { code: 'api_key', error: 'API key inválida o revocada. Revísela en Ajustes.' };
  if (err instanceof Anthropic.PermissionDeniedError) return { code: 'permiso', error: 'La API key no tiene permiso para este modelo.' };
  if (err instanceof Anthropic.NotFoundError) return { code: 'modelo', error: 'Modelo no encontrado. Revise el identificador en Ajustes.' };
  if (err instanceof Anthropic.RateLimitError) return { code: 'limite', error: 'Límite de uso de la API alcanzado. Espere o use el ingreso manual.' };
  if (err instanceof Anthropic.BadRequestError) return { code: 'peticion', error: 'La API rechazó la petición: ' + err.message };
  if (err instanceof Anthropic.APIConnectionError) return { code: 'sin_conexion', error: 'Sin conexión con la API. Use el ingreso manual.' };
  if (err instanceof Anthropic.APIError) return { code: 'api', error: `Error de la API (${String(err.status ?? '?')}). Use el ingreso manual.` };
  return { code: 'desconocido', error: (err as Error)?.message ?? String(err) };
}

export async function readCards(p: {
  apiKey: string; model: string; doubleRead: boolean; base64: string; mediaType: string; expected: number | null;
}): Promise<Result<{ cards: ReviewedCard[]; doubleRead: boolean; warnings: string[] }>> {
  if (!p.apiKey) return { ok: false, code: 'sin_api_key', error: 'No hay API key configurada. Use el ingreso manual o configúrela en Ajustes.' };
  let params: ReturnType<typeof buildRequest>;
  try { params = buildRequest(p.model, p.base64, p.mediaType, p.expected); } catch (e) { return { ok: false, ...classify(e) }; }
  const client = new Anthropic({ apiKey: p.apiKey, maxRetries: 2, timeout: 180_000 });
  const once = async (): Promise<RawCard[]> => {
    const resp = await client.beta.messages.create(params as Parameters<typeof client.beta.messages.create>[0]);
    return parseReading(textOf(resp as unknown as Parameters<typeof textOf>[0]));
  };
  const warnings: string[] = [];
  try {
    if (!p.doubleRead) {
      const a = await once();
      if (!a.length) return { ok: false, code: 'sin_cartones', error: 'No se encontraron cartones en la foto.' };
      return { ok: true, cards: combineReadings(a, null), doubleRead: false, warnings };
    }
    const [r1, r2] = await Promise.allSettled([once(), once()]);
    if (r1.status === 'rejected' && r2.status === 'rejected') throw r1.reason;
    const first = r1.status === 'fulfilled' ? r1.value : (r2 as PromiseFulfilledResult<RawCard[]>).value;
    const second = r1.status === 'fulfilled' && r2.status === 'fulfilled' ? r2.value : null;
    if (!first.length) return { ok: false, code: 'sin_cartones', error: 'No se encontraron cartones en la foto.' };
    const cards = combineReadings(first, second);
    if (!second) {
      warnings.push('Una de las dos lecturas falló; se muestra solo una. Revise todas las celdas.');
      cards.forEach((c) => { c.doubtfulCard = true; c.reasons.unshift('Sin segunda lectura para comparar'); });
    }
    return { ok: true, cards, doubleRead: !!second, warnings };
  } catch (e) {
    return { ok: false, ...classify(e) };
  }
}
