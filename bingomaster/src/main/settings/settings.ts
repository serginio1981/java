/**
 * Ajustes en app_meta. Las API keys se cifran con safeStorage de Electron y
 * nunca se envían a las ventanas. Cada proveedor de IA tiene su propia clave,
 * modelo y consentimiento.
 */
import type { SettingsView } from '../../shared/ipc/contract';
import { isProviderId, PROVIDER_IDS, PROVIDERS, validBaseUrl, type ProviderId } from '../../shared/import-ai/providers';
import { getMeta, setMeta, type Db } from '../db/database';
import { appError } from '../errors';
import type { ProviderConfig } from '../import-ai/vision';

export const DEFAULT_MODEL = PROVIDERS.anthropic.defaultModel;
/** Si cambia lo que se envía al proveedor de IA, subir la versión para volver a pedir consentimiento. */
export const CONSENT_VERSION = '1';
export { PRIVACY_URL } from '../../shared/links';

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(s: string): Buffer;
  decryptString(b: Buffer): string;
  getSelectedStorageBackend?(): string;
}

export class Settings {
  constructor(private readonly db: Db, private readonly safe: SafeStorageLike) {
    this.migrateLegacy();
  }

  /** Versiones anteriores guardaban una sola clave/modelo/consentimiento (de Anthropic). */
  private migrateLegacy(): void {
    for (const [oldKey, newKey] of [['ai.key', 'ai.key.anthropic'], ['ai.model', 'ai.model.anthropic'], ['ai.consent', 'ai.consent.anthropic']] as const) {
      const v = getMeta(this.db, oldKey);
      if (v !== null) {
        if (getMeta(this.db, newKey) === null) setMeta(this.db, newKey, v);
        setMeta(this.db, oldKey, null);
      }
    }
  }

  provider(): ProviderId {
    const p = getMeta(this.db, 'ai.provider');
    return isProviderId(p) ? p : 'anthropic';
  }

  model(p: ProviderId = this.provider()): string {
    return getMeta(this.db, `ai.model.${p}`) || PROVIDERS[p].defaultModel;
  }

  baseUrl(): string {
    return getMeta(this.db, 'ai.baseUrl') ?? '';
  }

  doubleRead(): boolean {
    return getMeta(this.db, 'ai.doubleRead') === '1';
  }

  consent(p: ProviderId = this.provider()): boolean {
    return getMeta(this.db, `ai.consent.${p}`) === CONSENT_VERSION;
  }

  importFolder(): string {
    return getMeta(this.db, 'import.folder') ?? '';
  }

  view(): SettingsView {
    let backend: string | null = null;
    if (process.platform === 'linux' && typeof this.safe.getSelectedStorageBackend === 'function') {
      try { backend = this.safe.getSelectedStorageBackend(); } catch { backend = null; }
    }
    const provider = this.provider();
    const providers = Object.fromEntries(PROVIDER_IDS.map((id) => [id, {
      model: this.model(id),
      // Una key copiada desde otro equipo (respaldo restaurado) no se puede descifrar: cuenta como no configurada.
      apiKeyConfigured: !!this.apiKey(id),
      consent: this.consent(id),
    }])) as SettingsView['providers'];
    const active = providers[provider];
    return {
      provider,
      providers,
      baseUrl: this.baseUrl(),
      model: active.model,
      apiKeyConfigured: active.apiKeyConfigured,
      // Listo para leer: clave (si el proveedor la exige), URL (si corresponde) y modelo.
      aiReady: (!PROVIDERS[provider].keyRequired || active.apiKeyConfigured)
        && (!PROVIDERS[provider].needsBaseUrl || !!this.baseUrl()) && !!active.model,
      doubleRead: this.doubleRead(),
      encryptionAvailable: this.safe.isEncryptionAvailable(),
      encryptionBackend: backend,
      importFolder: this.importFolder(),
      aiConsent: active.consent,
    };
  }

  update(u: { provider?: string; model?: string; baseUrl?: string; doubleRead?: boolean; aiConsent?: boolean }): void {
    if (u.provider !== undefined) {
      if (!isProviderId(u.provider)) throw appError('ajustes', 'Proveedor de IA desconocido');
      setMeta(this.db, 'ai.provider', u.provider);
    }
    const p = this.provider();
    if (u.model !== undefined) {
      const m = u.model.trim();
      if (m && !/^[A-Za-z0-9._:@/+-]{1,120}$/.test(m)) throw appError('ajustes', 'Identificador de modelo inválido');
      setMeta(this.db, `ai.model.${p}`, m || null);
    }
    if (u.baseUrl !== undefined) {
      const url = u.baseUrl.trim().replace(/\/+$/, '');
      if (url && !validBaseUrl(url)) throw appError('ajustes', 'La URL debe empezar con http:// o https://');
      setMeta(this.db, 'ai.baseUrl', url || null);
    }
    if (u.doubleRead !== undefined) setMeta(this.db, 'ai.doubleRead', u.doubleRead ? '1' : null);
    if (u.aiConsent !== undefined) setMeta(this.db, `ai.consent.${p}`, u.aiConsent ? CONSENT_VERSION : null);
  }

  setImportFolder(path: string | null): void {
    setMeta(this.db, 'import.folder', path);
  }

  /** Guarda la clave del proveedor activo. */
  setApiKey(key: string): void {
    const k = key.trim();
    if (!k) throw appError('ajustes', 'La API key está vacía');
    if (!this.safe.isEncryptionAvailable()) {
      throw appError('cifrado', 'Este equipo no ofrece cifrado seguro (safeStorage): no se guardará la API key');
    }
    setMeta(this.db, `ai.key.${this.provider()}`, this.safe.encryptString(k).toString('base64'));
  }

  clearApiKey(): void {
    setMeta(this.db, `ai.key.${this.provider()}`, null);
  }

  /** Solo para el proceso main. */
  apiKey(p: ProviderId = this.provider()): string {
    const enc = getMeta(this.db, `ai.key.${p}`);
    if (!enc || !this.safe.isEncryptionAvailable()) return '';
    try { return this.safe.decryptString(Buffer.from(enc, 'base64')); } catch { return ''; }
  }

  /** Configuración completa del proveedor activo para el módulo de visión. */
  providerConfig(): ProviderConfig {
    const provider = this.provider();
    return { provider, apiKey: this.apiKey(provider), model: this.model(provider), baseUrl: this.baseUrl() || undefined };
  }
}
