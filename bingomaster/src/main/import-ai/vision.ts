/**
 * Único módulo con acceso a internet: envía la foto al proveedor de IA que
 * eligió el operador, desde el proceso main y con los SDK oficiales:
 * - Anthropic (Claude): @anthropic-ai/sdk
 * - OpenAI (GPT) y servidores compatibles (Ollama, LM Studio…): openai
 * - Google (Gemini): @google/genai
 */
import Anthropic from '@anthropic-ai/sdk';
import { ApiError as GoogleApiError, GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import type { Result } from '../../shared/ipc/contract';
import { PROVIDERS, type ProviderId } from '../../shared/import-ai/providers';
import {
  combineReadings, MAX_CARDS_PER_PHOTO, parseReading, READING_SCHEMA, readingPrompt, ReadingError, type RawCard, type ReviewedCard,
} from '../../shared/import-ai/reading';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_TOKENS = 16000;
const TIMEOUT_MS = 180_000;
const SCHEMA = READING_SCHEMA as unknown as Record<string, unknown>;

export interface ProviderConfig {
  provider: ProviderId;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface Photo {
  base64: string;
  mediaType: string;
  expected: number | null;
}

function checkPhoto(p: Photo): number | null {
  if (!p.base64) throw new ReadingError('entrada', 'Falta la imagen');
  if (!IMAGE_TYPES.has(p.mediaType)) throw new ReadingError('entrada', `Formato de imagen no soportado: ${p.mediaType}`);
  return p.expected && p.expected >= 1 && p.expected <= MAX_CARDS_PER_PHOTO ? p.expected : null;
}

// ---------------------------------------------------------------- Anthropic

/** Modelos que aceptan `fallbacks: "default"` (reintento server-side si un clasificador rechaza). */
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5']);

export function buildAnthropicRequest(model: string, photo: Photo) {
  const exp = checkPhoto(photo);
  return {
    model,
    max_tokens: MAX_TOKENS,
    output_config: { effort: 'high' as const, format: { type: 'json_schema' as const, schema: SCHEMA } },
    messages: [
      {
        role: 'user' as const,
        content: [
          { type: 'image' as const, source: { type: 'base64' as const, media_type: photo.mediaType as 'image/jpeg', data: photo.base64 } },
          { type: 'text' as const, text: readingPrompt(exp) },
        ],
      },
    ],
    ...(FALLBACK_MODELS.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
  };
}

/** Compatibilidad con el nombre anterior. */
export const buildRequest = (model: string, base64: string, mediaType: string, expected: number | null) =>
  buildAnthropicRequest(model, { base64, mediaType, expected });

async function readAnthropic(cfg: ProviderConfig, photo: Photo): Promise<string> {
  const params = buildAnthropicRequest(cfg.model, photo);
  const client = new Anthropic({ apiKey: cfg.apiKey, maxRetries: 2, timeout: TIMEOUT_MS });
  const resp = await client.beta.messages.create(params as Parameters<typeof client.beta.messages.create>[0]) as unknown as {
    stop_reason: string | null; content: { type: string; text?: string }[];
  };
  if (resp.stop_reason === 'refusal') throw new ReadingError('rechazo', 'El modelo rechazó la petición. Use el ingreso manual.');
  if (resp.stop_reason === 'max_tokens') throw new ReadingError('truncada', 'La respuesta quedó incompleta.');
  return resp.content.filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('');
}

// ------------------------------------------------- OpenAI y compatibles

export function buildOpenAIRequest(model: string, photo: Photo, opts: { compatible: boolean; structured: boolean }) {
  const exp = checkPhoto(photo);
  return {
    model,
    // Los servidores compatibles suelen aceptar max_tokens; la API de OpenAI usa max_completion_tokens.
    ...(opts.compatible ? { max_tokens: MAX_TOKENS } : { max_completion_tokens: MAX_TOKENS }),
    messages: [
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: readingPrompt(exp) + (opts.structured ? '' : '\nResponde solo con el objeto JSON, sin texto adicional.') },
          { type: 'image_url' as const, image_url: { url: `data:${photo.mediaType};base64,${photo.base64}` } },
        ],
      },
    ],
    ...(opts.structured
      ? { response_format: { type: 'json_schema' as const, json_schema: { name: 'cartones', strict: true, schema: SCHEMA } } }
      : {}),
  };
}

function openaiClient(cfg: ProviderConfig): OpenAI {
  return new OpenAI({
    // Ollama y otros servidores locales no exigen clave, pero el SDK necesita un valor.
    apiKey: cfg.apiKey || 'sin-clave',
    maxRetries: 2,
    timeout: TIMEOUT_MS,
    ...(cfg.provider === 'compatible' ? { baseURL: cfg.baseUrl } : {}),
  });
}

async function readOpenAI(cfg: ProviderConfig, photo: Photo): Promise<string> {
  const client = openaiClient(cfg);
  const compatible = cfg.provider === 'compatible';
  let resp: OpenAI.Chat.Completions.ChatCompletion;
  try {
    resp = await client.chat.completions.create(buildOpenAIRequest(cfg.model, photo, { compatible, structured: true }));
  } catch (err) {
    // Algunos servidores compatibles no soportan json_schema: se reintenta pidiendo JSON por instrucciones.
    if (compatible && err instanceof OpenAI.BadRequestError) {
      resp = await client.chat.completions.create(buildOpenAIRequest(cfg.model, photo, { compatible, structured: false }));
    } else throw err;
  }
  const choice = resp.choices[0];
  if (!choice) throw new ReadingError('respuesta_invalida', 'Respuesta vacía del proveedor');
  if (choice.message.refusal) throw new ReadingError('rechazo', 'El modelo rechazó la petición. Use el ingreso manual.');
  if (choice.finish_reason === 'content_filter') throw new ReadingError('rechazo', 'El filtro de contenido del proveedor bloqueó la respuesta.');
  if (choice.finish_reason === 'length') throw new ReadingError('truncada', 'La respuesta quedó incompleta.');
  return choice.message.content ?? '';
}

// ------------------------------------------------------------- Google Gemini

export function buildGeminiRequest(model: string, photo: Photo) {
  const exp = checkPhoto(photo);
  return {
    model,
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: photo.mediaType, data: photo.base64 } }, { text: readingPrompt(exp) }] }],
    config: { responseMimeType: 'application/json', responseJsonSchema: SCHEMA, maxOutputTokens: MAX_TOKENS },
  };
}

/** Solo para pruebas automáticas: permite apuntar Gemini a un servidor local simulado. */
const geminiTestUrl = (): { baseUrl: string } | Record<string, never> =>
  process.env['BINGOMASTER_GEMINI_BASE_URL'] ? { baseUrl: process.env['BINGOMASTER_GEMINI_BASE_URL'] } : {};

async function readGoogle(cfg: ProviderConfig, photo: Photo): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: cfg.apiKey, httpOptions: { timeout: TIMEOUT_MS, ...geminiTestUrl() } });
  const resp = await ai.models.generateContent(buildGeminiRequest(cfg.model, photo));
  if (resp.promptFeedback?.blockReason) throw new ReadingError('rechazo', 'Google bloqueó la petición. Use el ingreso manual.');
  const reason = String(resp.candidates?.[0]?.finishReason ?? '');
  if (reason === 'MAX_TOKENS') throw new ReadingError('truncada', 'La respuesta quedó incompleta.');
  if (reason === 'SAFETY' || reason === 'PROHIBITED_CONTENT' || reason === 'BLOCKLIST') {
    throw new ReadingError('rechazo', 'Google bloqueó la respuesta. Use el ingreso manual.');
  }
  return resp.text ?? '';
}

// ------------------------------------------------------------------- común

async function readOnce(cfg: ProviderConfig, photo: Photo): Promise<RawCard[]> {
  const text = cfg.provider === 'anthropic' ? await readAnthropic(cfg, photo)
    : cfg.provider === 'google' ? await readGoogle(cfg, photo)
      : await readOpenAI(cfg, photo);
  return parseReading(text);
}

export function classify(err: unknown): { code: string; error: string } {
  if (err instanceof ReadingError) return { code: err.code, error: err.message };
  const byStatus = (status: number | undefined, message: string): { code: string; error: string } => {
    if (status === 401) return { code: 'api_key', error: 'API key inválida o revocada. Revísela en Ajustes.' };
    if (status === 403) return { code: 'permiso', error: 'La API key no tiene permiso para este modelo.' };
    if (status === 404) return { code: 'modelo', error: 'Modelo no encontrado. Revise el modelo en Ajustes.' };
    if (status === 429) return { code: 'limite', error: 'Límite de uso o saldo del proveedor agotado. Espere o use el ingreso manual.' };
    if (status === 400) return { code: 'peticion', error: 'El proveedor rechazó la petición: ' + message };
    return { code: 'api', error: `Error del proveedor (${String(status ?? '?')}). Use el ingreso manual.` };
  };
  if (err instanceof Anthropic.APIConnectionError || err instanceof OpenAI.APIConnectionError) {
    return { code: 'sin_conexion', error: 'Sin conexión con el proveedor de IA. Use el ingreso manual.' };
  }
  if (err instanceof Anthropic.APIError) return byStatus(err.status, err.message);
  if (err instanceof OpenAI.APIError) return byStatus(err.status, err.message);
  if (err instanceof GoogleApiError) {
    // Gemini responde 400 con "API key not valid" cuando la clave es incorrecta.
    if (err.status === 400 && /api key/i.test(err.message)) return byStatus(401, err.message);
    return byStatus(err.status, err.message);
  }
  const msg = (err as Error)?.message ?? String(err);
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network/i.test(msg)) {
    return { code: 'sin_conexion', error: 'Sin conexión con el proveedor de IA. Use el ingreso manual.' };
  }
  return { code: 'desconocido', error: msg };
}

function checkConfig(cfg: ProviderConfig): { code: string; error: string } | null {
  const info = PROVIDERS[cfg.provider];
  if (info.keyRequired && !cfg.apiKey) return { code: 'sin_api_key', error: `No hay API key de ${info.label}. Configúrela en Ajustes o use el ingreso manual.` };
  if (info.needsBaseUrl && !cfg.baseUrl) return { code: 'sin_url', error: 'Falta la URL del servidor compatible en Ajustes.' };
  if (!cfg.model) return { code: 'sin_modelo', error: `Elija el modelo de ${info.label} en Ajustes.` };
  return null;
}

export async function readCards(cfg: ProviderConfig & { doubleRead: boolean }, photo: Photo): Promise<Result<{ cards: ReviewedCard[]; doubleRead: boolean; warnings: string[] }>> {
  const bad = checkConfig(cfg);
  if (bad) return { ok: false, ...bad };
  try { checkPhoto(photo); } catch (e) { return { ok: false, ...classify(e) }; }
  const warnings: string[] = [];
  try {
    if (!cfg.doubleRead) {
      const a = await readOnce(cfg, photo);
      if (!a.length) return { ok: false, code: 'sin_cartones', error: 'No se encontraron cartones en la foto.' };
      return { ok: true, cards: combineReadings(a, null), doubleRead: false, warnings };
    }
    const [r1, r2] = await Promise.allSettled([readOnce(cfg, photo), readOnce(cfg, photo)]);
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

/** Palabras que identifican modelos que no sirven para leer imágenes (embeddings, audio, etc.). */
const NOT_VISION = /embedding|tts|whisper|dall-e|moderation|transcribe|audio|realtime|search|image|imagen|veo|aqa|computer-use/i;

/** Lista los modelos disponibles con la clave del operador, para elegir uno. */
export async function listModels(cfg: ProviderConfig): Promise<Result<{ models: string[] }>> {
  const info = PROVIDERS[cfg.provider];
  if (info.keyRequired && !cfg.apiKey) return { ok: false, code: 'sin_api_key', error: `Primero guarde la API key de ${info.label}.` };
  if (info.needsBaseUrl && !cfg.baseUrl) return { ok: false, code: 'sin_url', error: 'Primero indique la URL del servidor.' };
  try {
    const out: string[] = [];
    if (cfg.provider === 'anthropic') {
      const client = new Anthropic({ apiKey: cfg.apiKey, maxRetries: 1, timeout: 30_000 });
      for await (const m of client.models.list()) out.push(m.id);
    } else if (cfg.provider === 'google') {
      const ai = new GoogleGenAI({ apiKey: cfg.apiKey, httpOptions: { timeout: 30_000, ...geminiTestUrl() } });
      for await (const m of await ai.models.list()) {
        if (m.name && (!m.supportedActions || m.supportedActions.includes('generateContent'))) out.push(m.name.replace(/^models\//, ''));
      }
    } else {
      const client = openaiClient({ ...cfg, apiKey: cfg.apiKey });
      for await (const m of client.models.list()) out.push(m.id);
    }
    const filtered = cfg.provider === 'compatible' ? out : out.filter((id) => !NOT_VISION.test(id));
    return { ok: true, models: [...new Set(filtered)].sort() };
  } catch (e) {
    return { ok: false, ...classify(e) };
  }
}
