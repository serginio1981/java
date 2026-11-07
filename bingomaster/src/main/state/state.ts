import type {
  DisplayInfo, OperatorState, Overlay, PublicState, PublicWindowInfo, SettingsView,
} from '../../shared/ipc/contract';
import { compile } from '../../shared/patterns/patterns';
import { summarize } from '../../shared/validation/validate';
import { listCurrentCalls } from '../calls/calls';
import { cardIndex, summary } from '../cards/cards';
import type { Db } from '../db/database';
import { getActiveEvent, listEvents } from '../events/events';
import { getCurrentGame, listGames } from '../games/games';
import { listPatterns } from '../patterns/patterns';
import { listWinners } from '../winners/winners';

export function buildPublicState(db: Db, overlay: Overlay | null = null): PublicState {
  const event = getActiveEvent(db);
  const calls = event ? listCurrentCalls(db, event.id) : [];
  return {
    event,
    calls,
    last: calls[calls.length - 1] ?? null,
    lastFive: calls.slice(-5).reverse(),
    count: calls.length,
    current: event ? getCurrentGame(db, event.id) : null,
    overlay,
  };
}

/** Proyección explícita: solo copia los campos públicos. */
export function toPublic(s: OperatorState): PublicState {
  return { event: s.event, calls: s.calls, last: s.last, lastFive: s.lastFive, count: s.count, current: s.current, overlay: s.overlay };
}

export function buildOperatorState(
  db: Db,
  extra: {
    overlay: Overlay | null;
    settings: SettingsView;
    displays: DisplayInfo[];
    publicWindow: PublicWindowInfo;
    dataPath: string;
    notice: string | null;
  },
): OperatorState {
  const pub = buildPublicState(db, extra.overlay);
  const ev = pub.event;
  const near = ev && pub.current
    ? summarize(cardIndex(db, ev.id), pub.calls.map((c) => c.number), compile(pub.current.pattern.def))
    : null;
  return {
    ...pub,
    events: listEvents(db),
    games: ev ? listGames(db, ev.id) : [],
    patterns: listPatterns(db),
    winners: ev ? listWinners(db, ev.id) : [],
    cards: ev ? summary(db, ev.id) : { own: 0, external: 0, nextOwnFolio: 1 },
    near,
    settings: extra.settings,
    displays: extra.displays,
    publicWindow: extra.publicWindow,
    dataPath: extra.dataPath,
    notice: extra.notice,
  };
}
