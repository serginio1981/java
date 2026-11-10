/**
 * Prueba los tres SDK (Anthropic, OpenAI/compatible, Google Gemini) contra un
 * servidor local que imita cada API. No usa claves reales ni internet.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildGeminiRequest, buildOpenAIRequest, classify, listModels, readCards, type ProviderConfig } from '../src/main/import-ai/vision';
import { extractJson } from '../src/shared/import-ai/reading';

const CARD = {
  serie: 'ARROW', folio: '000777', completo: true, observaciones: '',
  columnas: { B: [6, 7, 8, 9, 10], I: [21, 22, 23, 24, 25], N: [36, 37, null, 38, 39], G: [51, 52, 53, 54, 55], O: [66, 67, 68, 69, 70] },
};
const JSON_TEXT = JSON.stringify({ cartones: [CARD] });
const PHOTO = { base64: Buffer.from('foto').toString('base64'), mediaType: 'image/jpeg', expected: 1 };

interface Seen { method: string; url: string; headers: IncomingMessage['headers']; body: Record<string, unknown> }
let seen: Seen[] = [];
let mode: 'ok' | 'fenced' | 'reject-schema' | 'unauthorized' = 'ok';
let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
      const send = (status: number, obj: unknown) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); };
      const url = req.url ?? '';
      if (mode === 'unauthorized') return send(401, { error: { message: 'bad key', type: 'authentication_error' } });
      // Anthropic
      if (url.startsWith('/v1/messages')) {
        return send(200, { id: 'm', type: 'message', role: 'assistant', model: body.model, stop_reason: 'end_turn', stop_sequence: null, content: [{ type: 'text', text: JSON_TEXT }], usage: { input_tokens: 1, output_tokens: 1 } });
      }
      if (url.startsWith('/v1/models') && req.method === 'GET' && req.headers['anthropic-version']) {
        return send(200, { data: [{ id: 'claude-opus-5-5', type: 'model', display_name: 'x', created_at: '2026-01-01T00:00:00Z' }], has_more: false, first_id: 'a', last_id: 'a' });
      }
      // Gemini (se identifica por su cabecera de clave)
      if (req.headers['x-goog-api-key']) {
        if (url.includes(':generateContent')) {
          return send(200, { candidates: [{ content: { role: 'model', parts: [{ text: JSON_TEXT }] }, finishReason: 'STOP' }] });
        }
        if (url.includes('/models') && req.method === 'GET') {
          return send(200, { models: [{ name: 'models/gemini-vision-x', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embedding-x', supportedGenerationMethods: ['embedContent'] }] });
        }
      }
      // OpenAI / compatible
      if (url.endsWith('/chat/completions')) {
        if (mode === 'reject-schema' && body.response_format) return send(400, { error: { message: 'response_format no soportado' } });
        const content = mode === 'fenced' || mode === 'reject-schema' ? 'Aquí está:\n```json\n' + JSON_TEXT + '\n```' : JSON_TEXT;
        return send(200, { id: 'c', object: 'chat.completion', created: 1, model: body.model, choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content, refusal: null } }] });
      }
      if (url.endsWith('/models') && req.method === 'GET') {
        return send(200, { object: 'list', data: [{ id: 'gpt-vision-x', object: 'model', created: 1, owned_by: 'x' }, { id: 'text-embedding-x', object: 'model', created: 1, owned_by: 'x' }] });
      }
      send(404, { error: { message: 'no encontrado ' + url } });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env['ANTHROPIC_BASE_URL'] = base;
  process.env['BINGOMASTER_GEMINI_BASE_URL'] = base;
});
afterAll(() => { server.close(); });

const run = (cfg: ProviderConfig, doubleRead = false) => { seen = []; return readCards({ ...cfg, doubleRead }, PHOTO); };

describe('lectura con cada proveedor', () => {
  it('Anthropic (Claude)', async () => {
    mode = 'ok';
    const r = await run({ provider: 'anthropic', apiKey: 'k-a', model: 'claude-opus-5-5' });
    expect(r).toMatchObject({ ok: true, cards: [{ folio: '000777', doubtfulCard: false }] });
    expect(seen[0]!.body['output_config']).toBeTruthy();
  });

  it('OpenAI: imagen como data URL y JSON Schema estricto', async () => {
    mode = 'ok';
    const r = await run({ provider: 'compatible', apiKey: 'k-o', model: 'gpt-vision-x', baseUrl: base + '/v1' });
    expect(r.ok).toBe(true);
    const body = seen[0]!.body as { response_format: { type: string; json_schema: { strict: boolean } }; messages: { content: { type: string; image_url?: { url: string } }[] }[] };
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.messages[0]!.content[1]!.image_url!.url).toMatch(/^data:image\/jpeg;base64,/);
    expect(seen[0]!.headers['authorization']).toBe('Bearer k-o');
  });

  it('servidor compatible sin json_schema: reintenta pidiendo JSON y acepta respuesta con ```json', async () => {
    mode = 'reject-schema';
    const r = await run({ provider: 'compatible', apiKey: '', model: 'llava', baseUrl: base + '/v1' });
    expect(r).toMatchObject({ ok: true, cards: [{ folio: '000777' }] });
    expect(seen).toHaveLength(2);
    expect(seen[1]!.body['response_format']).toBeUndefined();
  });

  it('Google Gemini: inlineData + responseJsonSchema', async () => {
    mode = 'ok';
    const r = await run({ provider: 'google', apiKey: 'k-g', model: 'gemini-vision-x' });
    expect(r).toMatchObject({ ok: true, cards: [{ folio: '000777' }] });
    expect(seen[0]!.url).toContain('gemini-vision-x:generateContent');
    const body = seen[0]!.body as { contents: { parts: { inlineData?: { mimeType: string } }[] }[]; generationConfig?: { responseMimeType: string } };
    expect(body.contents[0]!.parts[0]!.inlineData!.mimeType).toBe('image/jpeg');
    expect(JSON.stringify(body)).toContain('application/json');
  });

  it('doble lectura funciona con cualquier proveedor', async () => {
    mode = 'ok';
    const r = await run({ provider: 'google', apiKey: 'k-g', model: 'gemini-vision-x' }, true);
    expect(r).toMatchObject({ ok: true, doubleRead: true });
    expect(seen).toHaveLength(2);
  });

  it('clave inválida → mensaje legible', async () => {
    mode = 'unauthorized';
    expect(await run({ provider: 'compatible', apiKey: 'x', model: 'm', baseUrl: base + '/v1' })).toMatchObject({ ok: false, code: 'api_key' });
    expect(await run({ provider: 'anthropic', apiKey: 'x', model: 'claude-opus-5-5' })).toMatchObject({ ok: false, code: 'api_key' });
    mode = 'ok';
  });

  it('configuración incompleta no llama a la red', async () => {
    expect(await run({ provider: 'openai', apiKey: '', model: 'x' })).toMatchObject({ ok: false, code: 'sin_api_key' });
    expect(await run({ provider: 'google', apiKey: 'k', model: '' })).toMatchObject({ ok: false, code: 'sin_modelo' });
    expect(await run({ provider: 'compatible', apiKey: '', model: 'm' })).toMatchObject({ ok: false, code: 'sin_url' });
    expect(seen).toHaveLength(0);
  });

  it('sin conexión → código sin_conexion', async () => {
    const r = await readCards({ provider: 'compatible', apiKey: '', model: 'm', baseUrl: 'http://127.0.0.1:9/v1', doubleRead: false }, PHOTO);
    expect(r).toMatchObject({ ok: false, code: 'sin_conexion' });
  }, 60_000);
});

describe('listar modelos', () => {
  it('OpenAI/compatible y Gemini (filtra los que no leen imágenes)', async () => {
    mode = 'ok';
    expect(await listModels({ provider: 'compatible', apiKey: '', model: '', baseUrl: base + '/v1' })).toEqual({ ok: true, models: ['gpt-vision-x', 'text-embedding-x'] }); // compatible: sin filtrar
    expect(seen.some((x) => x.headers['x-goog-api-key'])).toBe(false);
    expect(await listModels({ provider: 'google', apiKey: 'k', model: '' })).toEqual({ ok: true, models: ['gemini-vision-x'] });
    expect(await listModels({ provider: 'anthropic', apiKey: 'k', model: '' })).toEqual({ ok: true, models: ['claude-opus-5-5'] });
  });
});

describe('piezas puras', () => {
  it('extractJson tolera texto y bloques ```json', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('Respuesta:\n```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson('texto {"a":3} fin')).toEqual({ a: 3 });
    expect(() => extractJson('nada')).toThrow(/JSON/);
  });
  it('construcción de peticiones', () => {
    expect(buildOpenAIRequest('m', PHOTO, { compatible: false, structured: true })).toHaveProperty('max_completion_tokens');
    expect(buildOpenAIRequest('m', PHOTO, { compatible: true, structured: false })).toHaveProperty('max_tokens');
    expect(buildGeminiRequest('g', PHOTO).config.responseMimeType).toBe('application/json');
    expect(() => buildGeminiRequest('g', { ...PHOTO, mediaType: 'image/heic' })).toThrow(/no soportado/);
    expect(classify(new Error('fetch failed')).code).toBe('sin_conexion');
  });
});
