/**
 * Ajustes en app_meta. La API key se cifra con safeStorage de Electron y
 * nunca se envía a las ventanas.
 */
import type { SettingsView } from '../../shared/ipc/contract';
import { getMeta, setMeta, type Db } from '../db/database';
import { appError } from '../errors';

export const DEFAULT_MODEL = 'claude-opus-5-5';
/** Si cambia lo que se envía al proveedor de IA, subir la versión para volver a pedir consentimiento. */
export const CONSENT_VERSION = '1';
export const PRIVACY_URL = 'https://bingomaster.net/privacidad.html';

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(s: string): Buffer;
  decryptString(b: Buffer): string;
  getSelectedStorageBackend?(): string;
}

export class Settings {
  constructor(private readonly db: Db, private readonly safe: SafeStorageLike) {}

  view(): SettingsView {
    let backend: string | null = null;
    if (process.platform === 'linux' && typeof this.safe.getSelectedStorageBackend === 'function') {
      try { backend = this.safe.getSelectedStorageBackend(); } catch { backend = null; }
    }
    return {
      model: this.model(),
      doubleRead: getMeta(this.db, 'ai.doubleRead') === '1',
      // Una key copiada desde otro equipo (respaldo restaurado) no se puede descifrar: cuenta como no configurada.
      apiKeyConfigured: !!this.apiKey(),
      encryptionAvailable: this.safe.isEncryptionAvailable(),
      encryptionBackend: backend,
      importFolder: this.importFolder(),
      aiConsent: getMeta(this.db, 'ai.consent') === CONSENT_VERSION,
    };
  }

  model(): string {
    return getMeta(this.db, 'ai.model') || DEFAULT_MODEL;
  }

  doubleRead(): boolean {
    return getMeta(this.db, 'ai.doubleRead') === '1';
  }

  importFolder(): string {
    return getMeta(this.db, 'import.folder') ?? '';
  }

  update(u: { model?: string; doubleRead?: boolean; aiConsent?: boolean }): void {
    if (u.model !== undefined) {
      const m = u.model.trim();
      if (m && !/^[A-Za-z0-9._:@/-]{3,100}$/.test(m)) throw appError('ajustes', 'Identificador de modelo inválido');
      setMeta(this.db, 'ai.model', m || null);
    }
    if (u.doubleRead !== undefined) setMeta(this.db, 'ai.doubleRead', u.doubleRead ? '1' : null);
    if (u.aiConsent !== undefined) setMeta(this.db, 'ai.consent', u.aiConsent ? CONSENT_VERSION : null);
  }

  setImportFolder(path: string | null): void {
    setMeta(this.db, 'import.folder', path);
  }

  setApiKey(key: string): void {
    const k = key.trim();
    if (!k) throw appError('ajustes', 'La API key está vacía');
    if (!this.safe.isEncryptionAvailable()) {
      throw appError('cifrado', 'Este equipo no ofrece cifrado seguro (safeStorage): no se guardará la API key');
    }
    setMeta(this.db, 'ai.key', this.safe.encryptString(k).toString('base64'));
  }

  clearApiKey(): void {
    setMeta(this.db, 'ai.key', null);
  }

  /** Solo para el proceso main. */
  apiKey(): string {
    const enc = getMeta(this.db, 'ai.key');
    if (!enc || !this.safe.isEncryptionAvailable()) return '';
    try { return this.safe.decryptString(Buffer.from(enc, 'base64')); } catch { return ''; }
  }
}
