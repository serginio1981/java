import { useEffect, useState } from 'react';
import type { OperatorState, PublicState } from '../../shared/ipc/contract';

/**
 * Estado recibido del proceso main (la fuente de verdad está siempre allí).
 * La ventana pública recibe solo la proyección pública.
 */
export function useAppState<T extends PublicState | OperatorState>(): T | null {
  const [state, setState] = useState<T | null>(null);
  useEffect(() => {
    let received = false;
    const off = window.bingo.onState((s) => {
      received = true;
      setState(s as T);
    });
    void window.bingo.invoke('state:get').then((s) => {
      if (!received) setState(s as unknown as T);
    });
    return off;
  }, []);
  return state;
}
