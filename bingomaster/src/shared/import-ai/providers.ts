/** Proveedores de IA disponibles para leer cartones. */

export type ProviderId = 'anthropic' | 'openai' | 'google' | 'compatible';

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  /** Quién recibe la foto (para el aviso de privacidad). */
  recipient: string;
  /** Modelo por defecto. Vacío = el operador debe elegirlo (no adivinamos nombres de modelos). */
  defaultModel: string;
  keyRequired: boolean;
  keyPlaceholder: string;
  needsBaseUrl: boolean;
  help: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    recipient: 'Anthropic (Estados Unidos)',
    defaultModel: 'claude-opus-5-5',
    keyRequired: true,
    keyPlaceholder: 'sk-ant-…',
    needsBaseUrl: false,
    help: 'Clave de API de la consola de Anthropic.',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI (GPT)',
    recipient: 'OpenAI (Estados Unidos)',
    defaultModel: '',
    keyRequired: true,
    keyPlaceholder: 'sk-…',
    needsBaseUrl: false,
    help: 'Clave de API de la plataforma de OpenAI. Elija un modelo que acepte imágenes.',
  },
  google: {
    id: 'google',
    label: 'Google (Gemini)',
    recipient: 'Google (Estados Unidos)',
    defaultModel: '',
    keyRequired: true,
    keyPlaceholder: 'AIza…',
    needsBaseUrl: false,
    help: 'Clave de API de Google AI Studio (Gemini API). Elija un modelo que acepte imágenes.',
  },
  compatible: {
    id: 'compatible',
    label: 'Servidor compatible con OpenAI (Ollama, LM Studio u otro)',
    recipient: 'el servidor configurado',
    defaultModel: '',
    keyRequired: false,
    keyPlaceholder: '(opcional)',
    needsBaseUrl: true,
    help: 'Servidor con API compatible con OpenAI, local o remoto (ej. http://localhost:11434/v1 para Ollama). Use un modelo con visión.',
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export const isProviderId = (x: unknown): x is ProviderId => typeof x === 'string' && x in PROVIDERS;

/** Valida la URL base de un servidor compatible. */
export function validBaseUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
