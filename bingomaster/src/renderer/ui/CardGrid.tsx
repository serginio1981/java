import type { Grid } from '../../shared/bingo/grid';
import { LETTERS } from '../../shared/bingo/numbers';

/**
 * Cartón de solo lectura. marked/target son máscaras de 25 bits (por filas).
 * - marcado: número cantado
 * - objetivo: celda de la figura
 * - falta: celda de la figura aún no cantada
 */
export function CardGrid({ grid, marked = 0, target = null, size = 'md' }: {
  grid: Grid;
  marked?: number;
  target?: number | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <table className={`card-grid card-${size}`}>
      <thead>
        <tr>{LETTERS.map((l) => <th key={l} className={`l-${l}`}>{l}</th>)}</tr>
      </thead>
      <tbody>
        {[0, 1, 2, 3, 4].map((r) => (
          <tr key={r}>
            {[0, 1, 2, 3, 4].map((c) => {
              const i = r * 5 + c;
              const v = grid[c]?.[r];
              const isMarked = ((marked >>> i) & 1) === 1;
              const inTarget = target !== null && ((target >>> i) & 1) === 1;
              const cls = [isMarked ? 'marked' : '', inTarget ? 'target' : '', inTarget && !isMarked ? 'missing' : '', v === null ? 'free' : '']
                .filter(Boolean).join(' ');
              return <td key={c} className={cls}>{v === null || v === undefined ? 'FREE' : v}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
