import { LETTERS } from '../../shared/bingo/numbers';

/** Grilla 5x5 de una máscara ("1"/"0" por filas). Clickeable si hay onToggle. */
export function MaskGrid({ mask, onToggle, size = 'md', showHeader = false }: {
  mask: string;
  onToggle?: (i: number) => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showHeader?: boolean;
}) {
  return (
    <div className={`mask-grid mask-${size}`} role="grid" aria-label="Figura">
      {showHeader && LETTERS.map((l) => <div key={l} className={`mask-head l-${l}`}>{l}</div>)}
      {Array.from({ length: 25 }, (_, i) => {
        const on = mask[i] === '1';
        const center = i === 12;
        const cls = `mask-cell${on ? ' on' : ''}${center ? ' center' : ''}`;
        return onToggle ? (
          <button key={i} type="button" className={cls} onClick={() => onToggle(i)} aria-pressed={on}
            title={center ? 'FREE (siempre marcado)' : undefined}>{center ? '★' : ''}</button>
        ) : (
          <div key={i} className={cls}>{center ? '★' : ''}</div>
        );
      })}
    </div>
  );
}
