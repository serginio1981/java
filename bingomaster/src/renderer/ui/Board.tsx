import { LETTERS, numbersByLetter } from '../../shared/bingo/numbers';

const BY_LETTER = numbersByLetter();

interface Props {
  called: ReadonlySet<number>;
  last?: number | null;
  onPick?: (n: number) => void;
  className?: string;
}

/** Tablero 1–75: una fila por letra, 15 números por fila. */
export function Board({ called, last, onPick, className }: Props) {
  return (
    <div className={'board ' + (className ?? '')} role="grid" aria-label="Tablero de números">
      {LETTERS.map((l) => (
        <div className="board-row" role="row" key={l}>
          <div className={`board-letter l-${l}`} role="rowheader">{l}</div>
          {BY_LETTER[l].map((n) => {
            const on = called.has(n);
            const cls = `board-cell l-${l}${on ? ' on' : ''}${last === n ? ' last' : ''}`;
            return onPick ? (
              <button key={n} type="button" role="gridcell" className={cls} onClick={() => onPick(n)}
                aria-pressed={on} title={on ? `${l}-${n} ya salió` : `Elegir ${l}-${n}`}>
                {n}
              </button>
            ) : (
              <div key={n} role="gridcell" className={cls} aria-selected={on}>{n}</div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
