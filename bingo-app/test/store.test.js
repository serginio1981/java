'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../src/main/store');

const columnas = {
  B: [1, 2, 3, 4, 5], I: [16, 17, 18, 19, 20], N: [31, 32, null, 34, 35],
  G: [46, 47, 48, 49, 50], O: [61, 62, 63, 64, 65],
};

function nuevo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-'));
  const s = new Store(dir);
  const ev = s.crearEvento('Evento prueba');
  return { s, ev, dir };
}

test('no guarda sin confirmación', () => {
  const { s, ev } = nuevo();
  const r = s.guardarCarton({ eventoId: ev.id, carton: { serie: 'A', folio: '1', columnas } });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, 'sin_confirmar');
});

test('no guarda cartón inválido aunque esté confirmado', () => {
  const { s, ev } = nuevo();
  const malo = Object.assign({}, columnas, { B: [1, 1, 3, 4, 5] });
  const r = s.guardarCarton({ eventoId: ev.id, confirmado: true, carton: { serie: 'A', folio: '1', columnas: malo } });
  assert.equal(r.codigo, 'invalido');
});

test('guarda externo, detecta duplicado serie+folio y permite forzar', () => {
  const { s, ev, dir } = nuevo();
  const base = { eventoId: ev.id, confirmado: true, metodo: 'vision', carton: { serie: 'A', folio: '0001', columnas } };
  const r1 = s.guardarCarton(Object.assign({}, base, { imagen: { base64: Buffer.from('x').toString('base64'), mediaType: 'image/jpeg' } }));
  assert.equal(r1.ok, true);
  assert.equal(r1.carton.origen, 'externo');
  assert.equal(r1.carton.folio, '0001');
  assert.ok(fs.existsSync(path.join(dir, 'imagenes', r1.carton.imagen)));

  const r2 = s.guardarCarton(base);
  assert.equal(r2.codigo, 'duplicado');
  const r3 = s.guardarCarton(Object.assign({}, base, { forzarDuplicado: true }));
  assert.equal(r3.ok, true);
  assert.equal(r3.carton.duplicadoForzado, true);

  // Persistencia y búsqueda por folio
  const s2 = new Store(dir);
  assert.equal(s2.buscarPorFolio(ev.id, '0001').length, 2);
  assert.equal(s2.buscarPorFolio(ev.id, '1').length, 0);
});

test('mismo folio en otro evento no es duplicado', () => {
  const { s, ev } = nuevo();
  const ev2 = s.crearEvento('Otro');
  const c = { serie: 'A', folio: '9', columnas };
  assert.equal(s.guardarCarton({ eventoId: ev.id, confirmado: true, carton: c }).ok, true);
  assert.equal(s.guardarCarton({ eventoId: ev2.id, confirmado: true, carton: c }).ok, true);
});
