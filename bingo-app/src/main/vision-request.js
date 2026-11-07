'use strict';
/*
 * Construcción de la petición a la API de Claude y lectura de la respuesta.
 * Funciones puras (sin red), para poder testearlas sin API key.
 */
const Carton = require('../shared/carton');

const MODELO_POR_DEFECTO = 'claude-opus-5-5';

// Modelos que aceptan el parámetro server-side `fallbacks: "default"`
// (si un clasificador de seguridad rechaza la petición, la API la reintenta
// en otro modelo). Para cualquier otro modelo se omite.
const MODELOS_CON_FALLBACK = new Set([
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-fable-5-1',
  'claude-sonnet-5-5',
]);
const BETA_FALLBACK = 'server-side-fallback-2026-07-01';

const TIPOS_IMAGEN = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_CARTONES = 4;

const columna = {
  type: 'array',
  description: 'Exactamente 5 valores, de arriba hacia abajo. null si la celda no se lee con certeza.',
  items: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
};

// Esquema de salida estricta. Los rangos por columna y el largo de los
// arreglos no se pueden expresar en structured outputs; se validan después
// con Carton.validar().
const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['cartones'],
  properties: {
    cartones: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['serie', 'folio', 'columnas', 'completo', 'observaciones'],
        properties: {
          serie: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
            description: 'Serie impresa, exactamente como aparece. null si no hay o no se lee.',
          },
          folio: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
            description: 'Folio/número de cartón impreso, exactamente como aparece (con ceros a la izquierda). null si no se lee.',
          },
          columnas: {
            type: 'object',
            additionalProperties: false,
            required: ['B', 'I', 'N', 'G', 'O'],
            properties: { B: columna, I: columna, N: columna, G: columna, O: columna },
          },
          completo: {
            type: 'boolean',
            description: 'false si el cartón está cortado, tapado, borroso o con reflejos que impiden leerlo entero.',
          },
          observaciones: {
            type: 'string',
            description: 'Problemas de lectura en una frase, o cadena vacía.',
          },
        },
      },
    },
  },
};

function instrucciones(cantidadEsperada) {
  const cuantos = cantidadEsperada
    ? 'La foto debería contener ' + cantidadEsperada + ' cartón(es).'
    : 'La foto contiene entre 1 y ' + MAX_CARTONES + ' cartones.';
  return [
    'Transcribe cartones de bingo de 75 bolas a partir de una foto.',
    cuantos,
    'Ordena los cartones de izquierda a derecha y de arriba hacia abajo.',
    'Cada cartón tiene 5 columnas con encabezado B, I, N, G, O y 5 filas.',
    'Rangos: B 1-15, I 16-30, N 31-45, G 46-60, O 61-75. La celda central (columna N, fila 3) es FREE: devuélvela como null.',
    'Entrega cada columna como un arreglo de 5 valores de arriba hacia abajo.',
    'Copia la serie y el folio tal como están impresos, sin corregirlos ni quitar ceros a la izquierda.',
    'Si un número o un dato no se lee con certeza, pon null. No adivines ni completes con números que "deberían" estar: el operador revisará cada celda dudosa.',
    'Si un cartón está cortado por el borde de la foto, tapado o ilegible, márcalo completo=false y explica en observaciones.',
    'No inventes cartones que no estén en la imagen.',
  ].join('\n');
}

/**
 * Arma los parámetros de client.beta.messages.create().
 * @param {{modelo?:string, imagenBase64:string, mediaType:string, cantidadEsperada?:number}} p
 */
function construirPeticion(p) {
  if (!p || typeof p.imagenBase64 !== 'string' || p.imagenBase64.length === 0) {
    throw new Error('Falta la imagen');
  }
  if (!TIPOS_IMAGEN.has(p.mediaType)) {
    throw new Error('Formato de imagen no soportado: ' + p.mediaType);
  }
  const modelo = (p.modelo || '').trim() || MODELO_POR_DEFECTO;
  const cantidad = Number.isInteger(p.cantidadEsperada) && p.cantidadEsperada >= 1 && p.cantidadEsperada <= MAX_CARTONES
    ? p.cantidadEsperada
    : null;
  const params = {
    model: modelo,
    max_tokens: 16000,
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema: ESQUEMA },
    },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.imagenBase64 } },
          { type: 'text', text: instrucciones(cantidad) },
        ],
      },
    ],
  };
  if (MODELOS_CON_FALLBACK.has(modelo)) {
    params.betas = [BETA_FALLBACK];
    params.fallbacks = 'default';
  }
  return params;
}

/**
 * Interpreta la respuesta de la API. Lanza Error con `codigo` si no sirve.
 * Devuelve arreglo de { carton (canónico), completo, observaciones }.
 */
function interpretarRespuesta(resp) {
  const fallo = (codigo, msg) => Object.assign(new Error(msg), { codigo });
  if (!resp || !Array.isArray(resp.content)) throw fallo('respuesta_invalida', 'Respuesta vacía de la API');
  if (resp.stop_reason === 'refusal') {
    throw fallo('rechazo', 'El modelo rechazó la petición. Use el ingreso manual.');
  }
  if (resp.stop_reason === 'max_tokens') {
    throw fallo('truncada', 'La respuesta quedó incompleta (max_tokens).');
  }
  const texto = resp.content
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('');
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch (e) {
    throw fallo('json_invalido', 'La respuesta no es JSON válido');
  }
  if (!datos || !Array.isArray(datos.cartones)) {
    throw fallo('json_invalido', 'La respuesta no trae la lista de cartones');
  }
  return datos.cartones.slice(0, MAX_CARTONES).map((c) => ({
    carton: Carton.normalizar(c),
    completo: !!(c && c.completo),
    observaciones: c && typeof c.observaciones === 'string' ? c.observaciones : '',
    columnasMalFormadas: Carton.COLUMNAS.filter(
      (k) => !(c && c.columnas && Array.isArray(c.columnas[k]) && c.columnas[k].length === 5)
    ),
  }));
}

/**
 * Combina una o dos lecturas en el resultado que ve el operador.
 * Cada cartón trae: carton, validacion, dudosas (claves de celda),
 * serieDudosa, folioDudoso, dudoso (bool), motivos (string[]).
 */
function combinarLecturas(lectura1, lectura2) {
  const motivosGlobales = [];
  if (lectura2 && lectura2.length !== lectura1.length) {
    motivosGlobales.push(
      'Las dos lecturas no coinciden en la cantidad de cartones (' + lectura1.length + ' vs ' + lectura2.length + ')'
    );
  }
  return lectura1.map((l, i) => {
    const validacion = Carton.validar(l.carton);
    const dudosas = new Set(Object.keys(validacion.celdas));
    const motivos = motivosGlobales.slice();
    let serieDudosa = false;
    let folioDudoso = !l.carton.folio;
    if (!l.completo) motivos.push('Cartón incompleto o poco legible en la foto');
    if (l.observaciones) motivos.push('IA: ' + l.observaciones);
    if (l.columnasMalFormadas.length) motivos.push('Columnas mal formadas en la lectura: ' + l.columnasMalFormadas.join(', '));
    if (lectura2) {
      const otra = lectura2[i];
      if (!otra) {
        motivos.push('La segunda lectura no encontró este cartón');
        for (const k of Carton.ordenCeldas('columnas')) dudosas.add(Carton.claveCelda(k.col, k.fila));
      } else {
        const dif = Carton.comparar(l.carton, otra.carton);
        dif.celdas.forEach((k) => dudosas.add(k));
        if (dif.celdas.length) motivos.push(dif.celdas.length + ' celda(s) difieren entre las dos lecturas');
        if (dif.serie) { serieDudosa = true; motivos.push('La serie difiere entre lecturas'); }
        if (dif.folio) { folioDudoso = true; motivos.push('El folio difiere entre lecturas'); }
      }
    }
    validacion.errores.forEach((e) => motivos.push(e));
    return {
      carton: l.carton,
      validacion,
      dudosas: Array.from(dudosas),
      serieDudosa,
      folioDudoso,
      dudoso: !validacion.ok || dudosas.size > 0 || serieDudosa || folioDudoso || !l.completo,
      motivos,
    };
  });
}

module.exports = {
  MODELO_POR_DEFECTO,
  MAX_CARTONES,
  ESQUEMA,
  construirPeticion,
  interpretarRespuesta,
  combinarLecturas,
};
