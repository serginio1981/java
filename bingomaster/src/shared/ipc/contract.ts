/**
 * Contrato tipado entre el proceso main y las ventanas.
 * Las ventanas envían comandos (invoke) y reciben el estado completo
 * después de cada cambio (canal STATE_CHANNEL).
 */
import type { Letter } from '../bingo/numbers';

export const STATE_CHANNEL = 'state:changed';

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

/** Lo que ve el proyector. Nunca incluye información solo para el operador. */
export interface PublicState {
  event: EventView | null;
  /** Números vigentes en orden de salida. */
  calls: CallView[];
  last: CallView | null;
  /** Hasta 5, del más reciente al más antiguo. */
  lastFive: CallView[];
  count: number;
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

export interface OperatorState extends PublicState {
  displays: DisplayInfo[];
  publicWindow: PublicWindowInfo;
  dataPath: string;
}

export type Ok<T = object> = { ok: true } & T;
export type Fail = { ok: false; code: string; error: string };
export type Result<T = object> = Ok<T> | Fail;

/** Mapa canal → (argumentos) → resultado. */
export interface Commands {
  'state:get': { args: []; result: OperatorState };
  'calls:add': { args: [number]; result: Result<{ call: CallView }> };
  'calls:undo': { args: []; result: Result<{ undone: CallView }> };
  'public:open': { args: [number | null]; result: Result };
  'public:close': { args: []; result: Result };
  'public:toggleFullscreen': { args: []; result: Result };
}

export type CommandName = keyof Commands;

export interface BingoBridge {
  invoke<K extends CommandName>(channel: K, ...args: Commands[K]['args']): Promise<Commands[K]['result']>;
  onState(cb: (state: OperatorState | PublicState) => void): () => void;
}
