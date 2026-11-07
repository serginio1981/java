import { useEffect, useState } from 'react';
import type { PatternDef } from '../../shared/patterns/patterns';
import { MaskGrid } from './MaskGrid';

/** Dibuja la figura. Los grupos rotan entre sus máscaras; "por cantidad" muestra el número. */
export function PatternPreview({ def, size = 'md', interval = 1400 }: { def: PatternDef; size?: 'sm' | 'md' | 'lg' | 'xl'; interval?: number }) {
  const [i, setI] = useState(0);
  const masks = def.type === 'mask' ? [def.mask] : def.type === 'group' ? def.masks : [];
  useEffect(() => {
    setI(0);
    if (masks.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % masks.length), interval);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(def), interval]);
  if (def.type === 'count') {
    return (
      <div className={`count-badge count-${size}`}>
        <strong>{def.n}</strong>
        <span>primeros números{def.freeCounts ? ' (con FREE)' : ''}</span>
      </div>
    );
  }
  return (
    <div className="pattern-preview">
      <MaskGrid mask={masks[i % masks.length] ?? masks[0] ?? ''} size={size} showHeader />
      {def.type === 'group' && <div className="any-of">cualquiera de {masks.length}{def.labels?.[i] ? ` · ${def.labels[i]}` : ''}</div>}
    </div>
  );
}
