/*
 * Reglas de un cartón de bingo de 75 bolas (5x5, B-I-N-G-O, centro FREE).
 * Módulo puro, sin dependencias: lo usan el proceso main (Node, CommonJS)
 * y el renderer (cargado como <script>, expone window.Carton).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Carton = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COLUMNAS = ['B', 'I', 'N', 'G', 'O'];
  const RANGOS = {
    B: [1, 15],
    I: [16, 30],
    N: [31, 45],
    G: [46, 60],
    O: [61, 75],
  };
  const FILAS = 5;
  const CENTRO = { col: 'N', fila: 2 };

  function esCentro(col, fila) {
    return col === CENTRO.col && fila === CENTRO.fila;
  }

  function claveCelda(col, fila) {
    return col + fila;
  }

  /** Cartón vacío con la forma canónica. */
  function vacio() {
    const columnas = {};
    for (const c of COLUMNAS) columnas[c] = [null, null, null, null, null];
    return { serie: '', folio: '', columnas };
  }

  /** Convierte un valor cualquiera en entero o null (sin adivinar). */
  function aEntero(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isInteger(v) ? v : null;
    const s = String(v).trim();
    if (!/^\d{1,2}$/.test(s)) return null;
    return parseInt(s, 10);
  }

  function aTexto(v) {
    if (v === null || v === undefined) return '';
    return String(v).trim();
  }

  /**
   * Lleva un cartón de cualquier origen (lectura IA, formulario) a la forma
   * canónica. Celdas ilegibles o con formato raro quedan en null; el centro
   * siempre queda en null (FREE).
   */
  function normalizar(entrada) {
    const out = vacio();
    if (!entrada || typeof entrada !== 'object') return out;
    out.serie = aTexto(entrada.serie);
    out.folio = aTexto(entrada.folio);
    const cols = entrada.columnas || {};
    for (const c of COLUMNAS) {
      const arr = Array.isArray(cols[c]) ? cols[c] : [];
      for (let f = 0; f < FILAS; f++) {
        out.columnas[c][f] = esCentro(c, f) ? null : aEntero(arr[f]);
      }
    }
    return out;
  }

  /**
   * Valida un cartón canónico.
   * Devuelve { ok, errores: string[], celdas: { [clave]: motivo } }.
   */
  function validar(carton) {
    const errores = [];
    const celdas = {};
    if (!carton || !carton.columnas) {
      return { ok: false, errores: ['Cartón sin datos'], celdas };
    }
    if (!aTexto(carton.folio)) errores.push('Falta el folio');

    const vistos = new Map();
    let cantidad = 0;
    for (const c of COLUMNAS) {
      const arr = carton.columnas[c];
      if (!Array.isArray(arr) || arr.length !== FILAS) {
        errores.push('La columna ' + c + ' no tiene 5 celdas');
        continue;
      }
      const [min, max] = RANGOS[c];
      for (let f = 0; f < FILAS; f++) {
        const v = arr[f];
        const k = claveCelda(c, f);
        if (esCentro(c, f)) {
          if (v !== null && v !== undefined) {
            celdas[k] = 'El centro debe ser FREE';
          }
          continue;
        }
        if (v === null || v === undefined || v === '') {
          celdas[k] = 'Celda vacía';
          continue;
        }
        if (!Number.isInteger(v)) {
          celdas[k] = 'No es un número entero';
          continue;
        }
        if (v < min || v > max) {
          celdas[k] = c + ' va de ' + min + ' a ' + max;
          continue;
        }
        cantidad++;
        if (vistos.has(v)) {
          celdas[k] = 'Número repetido';
          celdas[vistos.get(v)] = 'Número repetido';
        } else {
          vistos.set(v, k);
        }
      }
    }
    const nCeldas = Object.keys(celdas).length;
    if (nCeldas > 0) {
      errores.push(nCeldas + (nCeldas === 1 ? ' celda con problema' : ' celdas con problema'));
    }
    if (cantidad !== 24 && nCeldas === 0) {
      errores.push('Se esperaban 24 números y hay ' + cantidad);
    }
    return { ok: errores.length === 0, errores, celdas };
  }

  /**
   * Compara dos lecturas del mismo cartón. Devuelve las claves de celda que
   * difieren y si serie/folio difieren.
   */
  function comparar(a, b) {
    const celdas = [];
    for (const c of COLUMNAS) {
      for (let f = 0; f < FILAS; f++) {
        if (esCentro(c, f)) continue;
        const va = a && a.columnas ? a.columnas[c][f] : null;
        const vb = b && b.columnas ? b.columnas[c][f] : null;
        if (va !== vb) celdas.push(claveCelda(c, f));
      }
    }
    return {
      celdas,
      serie: aTexto(a && a.serie) !== aTexto(b && b.serie),
      folio: aTexto(a && a.folio) !== aTexto(b && b.folio),
    };
  }

  /**
   * Clave para detectar duplicados serie+folio dentro de un evento.
   * Solo ignora mayúsculas y espacios; NO quita ceros a la izquierda,
   * porque serie y folio se guardan tal como vienen impresos.
   */
  function claveIdentidad(serie, folio) {
    const n = (s) => aTexto(s).replace(/\s+/g, '').toUpperCase();
    return n(serie) + '|' + n(folio);
  }

  /** Orden de recorrido de celdas editables (sin el centro). */
  function ordenCeldas(modo) {
    const out = [];
    if (modo === 'filas') {
      for (let f = 0; f < FILAS; f++) {
        for (const c of COLUMNAS) if (!esCentro(c, f)) out.push({ col: c, fila: f });
      }
    } else {
      for (const c of COLUMNAS) {
        for (let f = 0; f < FILAS; f++) if (!esCentro(c, f)) out.push({ col: c, fila: f });
      }
    }
    return out;
  }

  /**
   * Para el ingreso rápido: ¿ya no cabe otro dígito en esta celda?
   * Ej. en B (1-15) tras "2" no puede venir otro dígito; tras "1" sí.
   */
  function celdaCompleta(col, texto) {
    if (!/^\d+$/.test(texto)) return false;
    if (texto.length >= 2) return true;
    const max = RANGOS[col][1];
    return parseInt(texto, 10) * 10 > max;
  }

  return {
    COLUMNAS,
    RANGOS,
    FILAS,
    CENTRO,
    esCentro,
    claveCelda,
    vacio,
    normalizar,
    validar,
    comparar,
    claveIdentidad,
    ordenCeldas,
    celdaCompleta,
  };
});
