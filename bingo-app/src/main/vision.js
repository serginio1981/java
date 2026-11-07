'use strict';
/*
 * Único módulo de la app que sale a internet: envía la foto a la API de
 * Claude desde el proceso main con el SDK oficial (@anthropic-ai/sdk).
 */
const Anthropic = require('@anthropic-ai/sdk');
const { construirPeticion, interpretarRespuesta, combinarLecturas } = require('./vision-request');

function clasificarError(err) {
  if (err && err.codigo) return { codigo: err.codigo, mensaje: err.message };
  if (err instanceof Anthropic.AuthenticationError) {
    return { codigo: 'api_key', mensaje: 'API key inválida o revocada. Revísela en Ajustes.' };
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return { codigo: 'permiso', mensaje: 'La API key no tiene permiso para este modelo.' };
  }
  if (err instanceof Anthropic.NotFoundError) {
    return { codigo: 'modelo', mensaje: 'Modelo no encontrado. Revise el identificador en Ajustes.' };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { codigo: 'limite', mensaje: 'Límite de uso de la API alcanzado. Espere un momento o use el ingreso manual.' };
  }
  if (err instanceof Anthropic.BadRequestError) {
    return { codigo: 'peticion', mensaje: 'La API rechazó la petición: ' + err.message };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { codigo: 'sin_conexion', mensaje: 'Sin conexión con la API. Use el ingreso manual.' };
  }
  if (err instanceof Anthropic.APIError) {
    return { codigo: 'api', mensaje: 'Error de la API (' + (err.status || '?') + '). Use el ingreso manual.' };
  }
  return { codigo: 'desconocido', mensaje: (err && err.message) || String(err) };
}

async function unaLectura(client, params) {
  const resp = await client.beta.messages.create(params);
  return interpretarRespuesta(resp);
}

/**
 * @param {{apiKey:string, modelo:string, dobleLectura:boolean,
 *          imagenBase64:string, mediaType:string, cantidadEsperada?:number}} p
 * @returns {Promise<{ok:true, cartones:any[], dobleLectura:boolean, avisos:string[]} | {ok:false, codigo:string, mensaje:string}>}
 */
async function leerCartones(p) {
  if (!p.apiKey) {
    return { ok: false, codigo: 'sin_api_key', mensaje: 'No hay API key configurada. Use el ingreso manual o configúrela en Ajustes.' };
  }
  let params;
  try {
    params = construirPeticion(p);
  } catch (e) {
    return { ok: false, codigo: 'entrada', mensaje: e.message };
  }
  const client = new Anthropic({ apiKey: p.apiKey, maxRetries: 2, timeout: 180000 });
  const avisos = [];
  try {
    if (!p.dobleLectura) {
      const l1 = await unaLectura(client, params);
      if (l1.length === 0) return { ok: false, codigo: 'sin_cartones', mensaje: 'No se encontraron cartones en la foto.' };
      return { ok: true, cartones: combinarLecturas(l1, null), dobleLectura: false, avisos };
    }
    // Dos llamadas independientes, en paralelo.
    const [r1, r2] = await Promise.allSettled([unaLectura(client, params), unaLectura(client, params)]);
    if (r1.status === 'rejected' && r2.status === 'rejected') throw r1.reason;
    const primera = r1.status === 'fulfilled' ? r1.value : r2.value;
    const segunda = r1.status === 'fulfilled' && r2.status === 'fulfilled' ? r2.value : null;
    if (primera.length === 0) return { ok: false, codigo: 'sin_cartones', mensaje: 'No se encontraron cartones en la foto.' };
    const cartones = combinarLecturas(primera, segunda);
    if (!segunda) {
      avisos.push('Una de las dos lecturas falló; se muestra solo una. Revise todas las celdas.');
      cartones.forEach((c) => { c.dudoso = true; c.motivos.unshift('Sin segunda lectura para comparar'); });
    }
    return { ok: true, cartones, dobleLectura: !!segunda, avisos };
  } catch (err) {
    return Object.assign({ ok: false }, clasificarError(err));
  }
}

module.exports = { leerCartones, clasificarError };
