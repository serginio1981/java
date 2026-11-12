/**
 * Contrato tipado entre el proceso main y las ventanas.
 * Las ventanas envían comandos (invoke) y reciben el estado tras cada cambio
 * por STATE_CHANNEL. La ventana pública recibe solo PublicState.
 */
import type { Grid } from '../bingo/grid';
import type { Letter } from '../bingo/numbers';
import type { ProviderId } from '../import-ai/providers';
import type { ReviewedCard } from '../import-ai/reading';
import type { PatternDef, PatternView } from '../patterns/patterns';

export const STATE_CHANNEL = 'state:changed';
export const FOLDER_CHANNEL = 'import:folderChanged';

export interface CallView {
  id: number;
  number: number;
  letter: Letter;
  /** Posición 1-based dentro de los números vigentes. */
  seq: number;
  calledAt: string;
}

export interface EventView {
  id: number;
  name: string;
  date: string;
  seriesCode: string;
  accumulateCalls: boolean;
}

export interface GameView {
  id: number;
  position: number;
  name: string;
  patternId: number;
  patternName: string;
  finished: boolean;
}

export interface CurrentGame {
  game: GameView;
  index: number; // 1-based
  total: number;
  pattern: PatternView;
}

export interface WinnerView {
  id: number;
  gameId: number;
  gameName: string;
  cardId: number;
  series: string;
  folio: string;
  origin: 'own' | 'external';
  callsCount: number;
  note: string | null;
  createdAt: string;
}

export interface Overlay {
  series: string;
  folio: string;
  gameName: string;
}

/** Lo que ve el proyector. Nunca incluye información solo para el operador. */
export interface PublicState {
  event: EventView | null;
  calls: CallView[];
  last: CallView | null;
  lastFive: CallView[];
  count: number;
  current: CurrentGame | null;
  /** El evento tiene juegos y todos terminaron. */
  gamesFinished: boolean;
  overlay: Overlay | null;
}

export interface DisplayInfo {
  id: number;
  label: string;
  width: number;
  height: number;
  primary: boolean;
}

export interface PublicWindowInfo {
  open: boolean;
  displayId: number | null;
  fullscreen: boolean;
}

export interface CardSummary {
  own: number;
  external: number;
  nextOwnFolio: number;
}

export interface ProviderSettings {
  model: string;
  apiKeyConfigured: boolean;
  consent: boolean;
}

export interface SettingsView {
  /** Proveedor de IA elegido para leer cartones. */
  provider: ProviderId;
  providers: Record<ProviderId, ProviderSettings>;
  /** URL del servidor compatible con OpenAI (solo proveedor "compatible"). */
  baseUrl: string;
  /** Datos del proveedor activo (atajos). */
  model: string;
  apiKeyConfigured: boolean;
  /** El proveedor activo tiene todo lo necesario (clave, URL, modelo) para leer. */
  aiReady: boolean;
  doubleRead: boolean;
  encryptionAvailable: boolean;
  encryptionBackend: string | null;
  importFolder: string;
  /** El operador aceptó el aviso de envío de fotos al proveedor de IA. */
  aiConsent: boolean;
}

export interface OperatorState extends PublicState {
  events: EventView[];
  games: GameView[];
  patterns: PatternView[];
  winners: WinnerView[];
  cards: CardSummary;
  /** Solo operador: cartones con la figura actual completa y a 1 número. */
  near: { complete: number; oneAway: number } | null;
  settings: SettingsView;
  displays: DisplayInfo[];
  publicWindow: PublicWindowInfo;
  dataPath: string;
  notice: string | null;
}

export interface CardView {
  id: number;
  series: string;
  folio: string;
  origin: 'own' | 'external';
  grid: Grid;
  createdAt: string;
  hasImage: boolean;
}

export interface ClaimView {
  card: CardView;
  game: GameView;
  pattern: PatternView;
  valid: boolean;
  complete: boolean;
  completedAtSeq: number | null;
  callsCount: number;
  marked: number;
  target: number | null;
  missingCount: number;
  reason: string;
  alreadyWinner: boolean;
}

export interface NewEventInput {
  name: string;
  date: string;
  seriesCode: string;
  accumulateCalls: boolean;
}

export interface PrintOptions {
  paper: 'Letter' | 'A4';
  perPage: 1 | 2 | 4;
  /** Rango de folios propios (números). Vacío = todos. */
  from?: number;
  to?: number;
}

export interface ExternalCardInput {
  series: string;
  folio: string;
  grid: Grid;
  /** Imagen de origen (JPEG/PNG base64) cuando viene de la importación con IA. */
  image?: { base64: string; mediaType: string };
  confirmed: true;
}

export interface FolderFile {
  name: string;
  size: number;
  modified: number;
  key: string;
  imported: boolean;
}

export type Ok<T = object> = { ok: true } & T;
export type Fail = { ok: false; code: string; error: string };
export type Result<T = object> = Ok<T> | Fail;

/** Mapa canal → (argumentos) → resultado. */
export interface Commands {
  'state:get': { args: []; result: OperatorState | PublicState };
  // Números
  'calls:add': { args: [number]; result: Result<{ call: CallView }> };
  'calls:undo': { args: []; result: Result<{ undone: CallView }> };
  // Eventos
  'events:create': { args: [NewEventInput]; result: Result<{ event: EventView }> };
  'events:update': { args: [number, { name: string; date: string; accumulateCalls: boolean }]; result: Result };
  'events:activate': { args: [number]; result: Result };
  'events:summary': { args: [number]; result: Result<{ cards: number; calls: number; winners: number; games: number }> };
  'events:delete': { args: [number]; result: Result };
  // Juegos
  'games:add': { args: [{ name: string; patternId: number }]; result: Result };
  'games:update': { args: [number, { name: string; patternId: number }]; result: Result };
  'games:remove': { args: [number]; result: Result };
  'games:move': { args: [number, -1 | 1]; result: Result };
  'games:next': { args: []; result: Result<{ next: GameView | null }> };
  'games:loadDefault': { args: []; result: Result };
  'games:setCurrent': { args: [number]; result: Result };
  // Figuras
  'patterns:create': { args: [{ name: string; def: PatternDef }]; result: Result<{ pattern: PatternView }> };
  'patterns:update': { args: [number, { name: string; def: PatternDef }]; result: Result };
  'patterns:remove': { args: [number]; result: Result };
  // Cartones
  'cards:generate': { args: [number]; result: Result<{ created: number; first: string; last: string }> };
  'cards:list': { args: [{ offset: number; limit: number; search?: string }]; result: { total: number; items: CardView[] } };
  'cards:find': { args: [string]; result: CardView[] };
  'cards:addExternal': { args: [ExternalCardInput]; result: Result<{ card: CardView }> };
  'cards:exists': { args: [string, string]; result: CardView | null };
  'cards:exportPdf': { args: [PrintOptions]; result: Result<{ path: string; count: number }> };
  'cards:image': { args: [number]; result: Result<{ dataUrl: string }> };
  // ¡Bingo!
  'claims:check': { args: [number]; result: Result<{ claim: ClaimView }> };
  'winners:register': { args: [number]; result: Result<{ winner: WinnerView }> };
  'winners:note': { args: [number, string]; result: Result };
  'overlay:show': { args: [Overlay]; result: Result };
  'overlay:hide': { args: []; result: Result };
  // Respaldo
  'data:backup': { args: []; result: Result<{ path: string }> };
  'data:restore': { args: []; result: Result<{ events: number; cards: number }> };
  // Ayuda
  'help:openManual': { args: [string | null]; result: Result };
  'help:openPrivacy': { args: []; result: Result };
  'help:openDonate': { args: []; result: Result };
  // Ventana pública
  'public:open': { args: [number | null]; result: Result };
  'public:close': { args: []; result: Result };
  'public:toggleFullscreen': { args: []; result: Result };
  // Ajustes e importación con IA
  'settings:update': { args: [{ provider?: ProviderId; model?: string; baseUrl?: string; doubleRead?: boolean; aiConsent?: boolean }]; result: Result };
  'import:listModels': { args: []; result: Result<{ models: string[] }> };
  'settings:setApiKey': { args: [string]; result: Result };
  'settings:clearApiKey': { args: []; result: Result };
  'import:chooseFolder': { args: []; result: Result };
  'import:clearFolder': { args: []; result: Result };
  'import:listFolder': { args: []; result: Result<{ folder: string; files: FolderFile[] }> };
  'import:readFolderFile': { args: [string]; result: Result<{ base64: string; mediaType: string; key: string }> };
  'import:markImported': { args: [string]; result: Result };
  'import:read': {
    args: [{ base64: string; mediaType: string; expected: number | null }];
    result: Result<{ cards: ReviewedCard[]; doubleRead: boolean; warnings: string[] }>;
  };
}

export type CommandName = keyof Commands;

export interface BingoBridge {
  invoke<K extends CommandName>(channel: K, ...args: Commands[K]['args']): Promise<Commands[K]['result']>;
  onState(cb: (state: OperatorState | PublicState) => void): () => void;
  onFolderChanged(cb: () => void): () => void;
}
