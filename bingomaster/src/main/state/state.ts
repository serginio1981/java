import type { DisplayInfo, OperatorState, PublicState, PublicWindowInfo } from '../../shared/ipc/contract';
import { listCurrentCalls } from '../calls/calls';
import type { Db } from '../db/database';
import { getActiveEvent } from '../events/events';

export function buildPublicState(db: Db): PublicState {
  const event = getActiveEvent(db);
  const calls = event ? listCurrentCalls(db, event.id) : [];
  return {
    event,
    calls,
    last: calls[calls.length - 1] ?? null,
    lastFive: calls.slice(-5).reverse(),
    count: calls.length,
  };
}

/** Proyección explícita: solo copia los campos públicos. */
export function toPublic(s: OperatorState): PublicState {
  return { event: s.event, calls: s.calls, last: s.last, lastFive: s.lastFive, count: s.count };
}

export function buildOperatorState(
  db: Db,
  extra: { displays: DisplayInfo[]; publicWindow: PublicWindowInfo; dataPath: string },
): OperatorState {
  return { ...buildPublicState(db), ...extra };
}
