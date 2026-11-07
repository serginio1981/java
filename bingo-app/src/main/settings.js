'use strict';
/*
 * Ajustes de la app. La API key se guarda cifrada con safeStorage de
 * Electron (llavero del sistema operativo); nunca en texto plano.
 */
const fs = require('fs');
const path = require('path');
const { MODELO_POR_DEFECTO } = require('./vision-request');

const POR_DEFECTO = {
  modelo: MODELO_POR_DEFECTO,
  dobleLectura: false,
  carpetaCompartida: '',
  eventoActivo: '',
  ordenIngreso: 'columnas',
  apiKeyCifrada: '',
};

class Settings {
  constructor(dir, safeStorage) {
    this.archivo = path.join(dir, 'ajustes.json');
    this.safeStorage = safeStorage;
    this.valores = Object.assign({}, POR_DEFECTO, this._cargar());
  }

  _cargar() {
    try {
      return JSON.parse(fs.readFileSync(this.archivo, 'utf8'));
    } catch (_) {
      return {};
    }
  }

  _guardar() {
    const tmp = this.archivo + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.valores, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.archivo);
  }

  cifradoDisponible() {
    return this.safeStorage.isEncryptionAvailable();
  }

  /** En Linux, 'basic_text' significa que no hay llavero real y el cifrado es débil. */
  backendCifrado() {
    if (process.platform === 'linux' && typeof this.safeStorage.getSelectedStorageBackend === 'function') {
      try { return this.safeStorage.getSelectedStorageBackend(); } catch (_) { return 'desconocido'; }
    }
    return null;
  }

  publicos() {
    const { apiKeyCifrada, ...resto } = this.valores;
    return Object.assign(resto, {
      apiKeyConfigurada: !!apiKeyCifrada,
      cifradoDisponible: this.cifradoDisponible(),
      backendCifrado: this.backendCifrado(),
    });
  }

  actualizar(parcial) {
    const permitidos = ['modelo', 'dobleLectura', 'carpetaCompartida', 'eventoActivo', 'ordenIngreso'];
    for (const k of permitidos) {
      if (parcial && Object.prototype.hasOwnProperty.call(parcial, k)) {
        let v = parcial[k];
        if (k === 'dobleLectura') v = !!v;
        else if (k === 'ordenIngreso') v = v === 'filas' ? 'filas' : 'columnas';
        else v = String(v || '').trim();
        if (k === 'modelo' && !v) v = MODELO_POR_DEFECTO;
        this.valores[k] = v;
      }
    }
    this._guardar();
    return this.publicos();
  }

  guardarApiKey(key) {
    const k = String(key || '').trim();
    if (!k) throw new Error('API key vacía');
    if (!this.cifradoDisponible()) {
      throw new Error('El sistema no ofrece cifrado seguro (safeStorage). No se guardará la API key.');
    }
    this.valores.apiKeyCifrada = this.safeStorage.encryptString(k).toString('base64');
    this._guardar();
  }

  borrarApiKey() {
    this.valores.apiKeyCifrada = '';
    this._guardar();
  }

  /** Solo para uso interno del proceso main; nunca se envía al renderer. */
  apiKey() {
    if (!this.valores.apiKeyCifrada || !this.cifradoDisponible()) return '';
    try {
      return this.safeStorage.decryptString(Buffer.from(this.valores.apiKeyCifrada, 'base64'));
    } catch (_) {
      return '';
    }
  }
}

module.exports = { Settings };
