'use strict';
/*
 * Almacenamiento local en JSON (carpeta userData de Electron).
 * Escritura atómica: archivo temporal + rename.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Carton = require('../shared/carton');

class Store {
  constructor(dir) {
    this.dir = dir;
    this.archivo = path.join(dir, 'datos.json');
    this.dirImagenes = path.join(dir, 'imagenes');
    fs.mkdirSync(this.dirImagenes, { recursive: true });
    this.datos = this._cargar();
  }

  _cargar() {
    try {
      const d = JSON.parse(fs.readFileSync(this.archivo, 'utf8'));
      return {
        eventos: Array.isArray(d.eventos) ? d.eventos : [],
        cartones: Array.isArray(d.cartones) ? d.cartones : [],
        procesadas: d.procesadas && typeof d.procesadas === 'object' ? d.procesadas : {},
      };
    } catch (e) {
      if (e.code !== 'ENOENT') {
        // No pisar un archivo corrupto: se respalda antes de empezar de cero.
        try { fs.copyFileSync(this.archivo, this.archivo + '.corrupto-' + Date.now()); } catch (_) { /* nada */ }
      }
      return { eventos: [], cartones: [], procesadas: {} };
    }
  }

  _guardar() {
    const tmp = this.archivo + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.datos, null, 2));
    fs.renameSync(tmp, this.archivo);
  }

  listarEventos() {
    return this.datos.eventos.slice();
  }

  crearEvento(nombre) {
    const n = String(nombre || '').trim();
    if (!n) throw new Error('El evento necesita un nombre');
    const ev = { id: crypto.randomUUID(), nombre: n, creadoEn: new Date().toISOString() };
    this.datos.eventos.push(ev);
    this._guardar();
    return ev;
  }

  existeEvento(id) {
    return this.datos.eventos.some((e) => e.id === id);
  }

  buscarDuplicado(eventoId, serie, folio) {
    const k = Carton.claveIdentidad(serie, folio);
    return this.datos.cartones.find((c) => c.eventoId === eventoId && Carton.claveIdentidad(c.serie, c.folio) === k) || null;
  }

  buscarPorFolio(eventoId, folio) {
    const f = String(folio || '').replace(/\s+/g, '').toUpperCase();
    if (!f) return [];
    return this.datos.cartones.filter(
      (c) => c.eventoId === eventoId && String(c.folio).replace(/\s+/g, '').toUpperCase() === f
    );
  }

  listarCartones(eventoId) {
    return this.datos.cartones.filter((c) => c.eventoId === eventoId);
  }

  /**
   * Guarda un cartón ya confirmado por el operador.
   * @param {{eventoId, carton, origen, metodo, imagen?:{base64, mediaType}, forzarDuplicado?:boolean, confirmado:boolean}} p
   */
  guardarCarton(p) {
    if (p.confirmado !== true) {
      return { ok: false, codigo: 'sin_confirmar', mensaje: 'El cartón debe confirmarse antes de guardarse.' };
    }
    if (!this.existeEvento(p.eventoId)) {
      return { ok: false, codigo: 'evento', mensaje: 'Seleccione un evento activo.' };
    }
    const carton = Carton.normalizar(p.carton);
    const v = Carton.validar(carton);
    if (!v.ok) return { ok: false, codigo: 'invalido', mensaje: v.errores.join('. '), validacion: v };

    const dup = this.buscarDuplicado(p.eventoId, carton.serie, carton.folio);
    if (dup && p.forzarDuplicado !== true) {
      return {
        ok: false,
        codigo: 'duplicado',
        mensaje: 'Ya existe un cartón con serie "' + dup.serie + '" y folio "' + dup.folio + '" en este evento.',
        existente: dup,
      };
    }

    const id = crypto.randomUUID();
    let imagen = null;
    if (p.imagen && p.imagen.base64) {
      const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[p.imagen.mediaType] || '.jpg';
      imagen = id + ext;
      fs.writeFileSync(path.join(this.dirImagenes, imagen), Buffer.from(p.imagen.base64, 'base64'));
    }
    const registro = {
      id,
      eventoId: p.eventoId,
      origen: p.origen === 'propio' ? 'propio' : 'externo',
      metodo: p.metodo === 'vision' ? 'vision' : 'manual',
      serie: carton.serie,
      folio: carton.folio,
      columnas: carton.columnas,
      imagen,
      duplicadoForzado: !!dup,
      creadoEn: new Date().toISOString(),
    };
    this.datos.cartones.push(registro);
    this._guardar();
    return { ok: true, carton: registro };
  }

  marcarProcesada(clave) {
    this.datos.procesadas[clave] = new Date().toISOString();
    this._guardar();
  }

  procesadas() {
    return Object.assign({}, this.datos.procesadas);
  }
}

module.exports = { Store };
