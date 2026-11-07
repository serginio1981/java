'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../src/main/vision-request');

const cartonIA = (folio, cambios) => Object.assign({
  serie: 'S1',
  folio,
  completo: true,
  observaciones: '',
  columnas: {
    B: [1, 2, 3, 4, 5], I: [16, 17, 18, 19, 20], N: [31, 32, null, 34, 35],
    G: [46, 47, 48, 49, 50], O: [61, 62, 63, 64, 65],
  },
}, cambios);

const resp = (cartones, extra) => Object.assign({
  stop_reason: 'end_turn',
  content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify({ cartones }) }],
}, extra);

test('construirPeticion arma imagen + esquema + fallback para el modelo por defecto', () => {
  const p = V.construirPeticion({ imagenBase64: 'AAAA', mediaType: 'image/jpeg', cantidadEsperada: 2 });
  assert.equal(p.model, 'claude-opus-5-5');
  assert.equal(p.output_config.format.type, 'json_schema');
  assert.equal(p.messages[0].content[0].type, 'image');
  assert.equal(p.messages[0].content[0].source.media_type, 'image/jpeg');
  assert.match(p.messages[0].content[1].text, /2 cartón/);
  assert.equal(p.fallbacks, 'default');
  assert.deepEqual(p.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(p.thinking, undefined);
});

test('construirPeticion sin fallback para otros modelos', () => {
  const p = V.construirPeticion({ modelo: 'claude-haiku-5-5', imagenBase64: 'AAAA', mediaType: 'image/png' });
  assert.equal(p.model, 'claude-haiku-5-5');
  assert.equal(p.fallbacks, undefined);
  assert.equal(p.betas, undefined);
});

test('construirPeticion rechaza formatos no soportados', () => {
  assert.throws(() => V.construirPeticion({ imagenBase64: 'AAAA', mediaType: 'image/heic' }), /no soportado/);
  assert.throws(() => V.construirPeticion({ imagenBase64: '', mediaType: 'image/png' }), /Falta la imagen/);
});

test('el esquema cumple additionalProperties:false en todos los objetos', () => {
  const revisar = (s) => {
    if (s && s.type === 'object') assert.equal(s.additionalProperties, false);
    if (s && typeof s === 'object') Object.values(s).forEach(revisar);
  };
  revisar(V.ESQUEMA);
});

test('interpretarRespuesta lee el bloque de texto y normaliza', () => {
  const r = V.interpretarRespuesta(resp([cartonIA('0001')]));
  assert.equal(r.length, 1);
  assert.equal(r[0].carton.folio, '0001');
  assert.equal(r[0].carton.columnas.N[2], null);
});

test('interpretarRespuesta: rechazo y truncado', () => {
  assert.throws(() => V.interpretarRespuesta(resp([], { stop_reason: 'refusal' })), (e) => e.codigo === 'rechazo');
  assert.throws(() => V.interpretarRespuesta(resp([], { stop_reason: 'max_tokens' })), (e) => e.codigo === 'truncada');
  assert.throws(() => V.interpretarRespuesta({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'hola' }] }),
    (e) => e.codigo === 'json_invalido');
});

test('combinar una lectura válida: no dudoso', () => {
  const l = V.interpretarRespuesta(resp([cartonIA('0001')]));
  const [c] = V.combinarLecturas(l, null);
  assert.equal(c.dudoso, false);
  assert.deepEqual(c.dudosas, []);
});

test('combinar marca dudoso por validación y por cartón incompleto', () => {
  const malo = cartonIA('0001', { completo: false });
  malo.columnas = Object.assign({}, malo.columnas, { B: [1, 2, null, 4, 99] });
  const [c] = V.combinarLecturas(V.interpretarRespuesta(resp([malo])), null);
  assert.equal(c.dudoso, true);
  assert.ok(c.dudosas.includes('B2'));
  assert.ok(c.dudosas.includes('B4'));
});

test('doble lectura: celdas distintas y folio distinto son dudosos', () => {
  const a = V.interpretarRespuesta(resp([cartonIA('0001')]));
  const otro = cartonIA('0007');
  otro.columnas = Object.assign({}, otro.columnas, { G: [46, 47, 48, 49, 51] });
  const b = V.interpretarRespuesta(resp([otro]));
  const [c] = V.combinarLecturas(a, b);
  assert.equal(c.dudoso, true);
  assert.deepEqual(c.dudosas, ['G4']);
  assert.equal(c.folioDudoso, true);
});

test('doble lectura con distinta cantidad de cartones', () => {
  const a = V.interpretarRespuesta(resp([cartonIA('1'), cartonIA('2')]));
  const b = V.interpretarRespuesta(resp([cartonIA('1')]));
  const r = V.combinarLecturas(a, b);
  assert.equal(r[1].dudosas.length, 24);
  assert.ok(r[0].motivos[0].includes('cantidad'));
});

test('máximo 4 cartones', () => {
  const muchos = [1, 2, 3, 4, 5].map((i) => cartonIA(String(i)));
  assert.equal(V.interpretarRespuesta(resp(muchos)).length, 4);
});
