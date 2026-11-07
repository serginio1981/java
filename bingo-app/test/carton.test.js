'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/shared/carton');

function valido() {
  return {
    serie: 'A-12',
    folio: '000123',
    columnas: {
      B: [1, 5, 9, 12, 15],
      I: [16, 20, 22, 27, 30],
      N: [31, 35, null, 40, 45],
      G: [46, 50, 52, 57, 60],
      O: [61, 66, 70, 72, 75],
    },
  };
}

test('cartón válido pasa', () => {
  const v = C.validar(C.normalizar(valido()));
  assert.equal(v.ok, true, v.errores.join());
});

test('falta folio', () => {
  const c = valido(); c.folio = '  ';
  const v = C.validar(C.normalizar(c));
  assert.equal(v.ok, false);
  assert.ok(v.errores.includes('Falta el folio'));
});

test('número fuera de rango de la columna', () => {
  const c = valido(); c.columnas.B[0] = 16;
  const v = C.validar(C.normalizar(c));
  assert.equal(v.ok, false);
  assert.match(v.celdas.B0, /B va de 1 a 15/);
});

test('repetidos se marcan en ambas celdas', () => {
  const c = valido(); c.columnas.B[1] = 1;
  const v = C.validar(C.normalizar(c));
  assert.equal(v.ok, false);
  assert.equal(v.celdas.B0, 'Número repetido');
  assert.equal(v.celdas.B1, 'Número repetido');
});

test('celda vacía', () => {
  const c = valido(); c.columnas.O[4] = null;
  const v = C.validar(C.normalizar(c));
  assert.equal(v.celdas.O4, 'Celda vacía');
});

test('normalizar fuerza FREE en el centro y no adivina', () => {
  const n = C.normalizar({ folio: 7, columnas: { N: [31, 32, 33, 34, 35], B: ['3', 'x', 4.5, '012', 2] } });
  assert.equal(n.columnas.N[2], null);
  assert.deepEqual(n.columnas.B, [3, null, null, null, 2]);
  assert.equal(n.folio, '7');
});

test('centro con número es inválido si llega sin normalizar', () => {
  const c = valido(); c.columnas.N[2] = 33;
  assert.equal(C.validar(c).celdas.N2, 'El centro debe ser FREE');
});

test('comparar detecta celdas, serie y folio distintos', () => {
  const a = C.normalizar(valido());
  const b = C.normalizar(valido());
  b.columnas.G[3] = 58; b.folio = '000128';
  const d = C.comparar(a, b);
  assert.deepEqual(d.celdas, ['G3']);
  assert.equal(d.folio, true);
  assert.equal(d.serie, false);
});

test('claveIdentidad ignora espacios y mayúsculas pero no ceros', () => {
  assert.equal(C.claveIdentidad(' a 12', '000123'), C.claveIdentidad('A12', '000123'));
  assert.notEqual(C.claveIdentidad('A', '0123'), C.claveIdentidad('A', '123'));
});

test('orden de celdas omite el centro', () => {
  assert.equal(C.ordenCeldas('columnas').length, 24);
  assert.deepEqual(C.ordenCeldas('columnas')[5], { col: 'I', fila: 0 });
  assert.deepEqual(C.ordenCeldas('filas')[1], { col: 'I', fila: 0 });
});

test('celdaCompleta para avance automático', () => {
  assert.equal(C.celdaCompleta('B', '1'), false); // podría ser 10-15
  assert.equal(C.celdaCompleta('B', '2'), true);
  assert.equal(C.celdaCompleta('O', '7'), false); // 70-75
  assert.equal(C.celdaCompleta('O', '8'), true);
  assert.equal(C.celdaCompleta('I', '16'), true);
});
