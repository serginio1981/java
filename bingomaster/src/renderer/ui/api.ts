import type { CommandName, Commands, Fail } from '../../shared/ipc/contract';

type Listener = (t: Toast) => void;
export interface Toast { kind: 'ok' | 'error' | 'info'; text: string; id: number }

const listeners = new Set<Listener>();
let seq = 0;

export function toast(kind: Toast['kind'], text: string): void {
  const t = { kind, text, id: ++seq };
  listeners.forEach((l) => l(t));
}

export function onToast(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Llama al main; si el resultado es {ok:false} muestra el error y devuelve null. */
export async function call<K extends CommandName>(
  channel: K,
  ...args: Commands[K]['args']
): Promise<Exclude<Commands[K]['result'], Fail> | null> {
  try {
    const r = await window.bingo.invoke(channel, ...args);
    if (r && typeof r === 'object' && 'ok' in r && r.ok === false) {
      if (r.code !== 'cancelado') toast('error', r.error);
      return null;
    }
    return r as Exclude<Commands[K]['result'], Fail>;
  } catch (e) {
    toast('error', 'Error inesperado: ' + (e as Error).message);
    return null;
  }
}
