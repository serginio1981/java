import { BUILTIN_PATTERNS, validatePatternDef, type PatternDef, type PatternView } from '../../shared/patterns/patterns';
import { transaction, type Db } from '../db/database';
import { appError } from '../errors';

interface Row { id: number; name: string; type: string; definition_json: string; is_builtin: number }

const toView = (r: Row): PatternView => ({
  id: r.id,
  name: r.name,
  isBuiltin: r.is_builtin === 1,
  def: JSON.parse(r.definition_json) as PatternDef,
});

/** Inserta o actualiza la biblioteca precargada (idempotente). */
export function ensureBuiltinPatterns(db: Db): void {
  transaction(db, () => {
    const find = db.prepare('SELECT id FROM patterns WHERE is_builtin = 1 AND name = ?');
    const ins = db.prepare('INSERT INTO patterns (name, type, definition_json, is_builtin) VALUES (?, ?, ?, 1)');
    const upd = db.prepare('UPDATE patterns SET type = ?, definition_json = ? WHERE id = ?');
    for (const p of BUILTIN_PATTERNS) {
      const row = find.get(p.name) as { id: number } | undefined;
      if (row) upd.run(p.def.type, JSON.stringify(p.def), row.id);
      else ins.run(p.name, p.def.type, JSON.stringify(p.def));
    }
  });
}

export function listPatterns(db: Db): PatternView[] {
  return (db.prepare('SELECT * FROM patterns ORDER BY is_builtin DESC, id').all() as unknown as Row[]).map(toView);
}

export function getPattern(db: Db, id: number): PatternView | null {
  const r = db.prepare('SELECT * FROM patterns WHERE id = ?').get(id) as Row | undefined;
  return r ? toView(r) : null;
}

export function findPatternByName(db: Db, name: string): PatternView | null {
  const r = db.prepare('SELECT * FROM patterns WHERE name = ? ORDER BY is_builtin DESC LIMIT 1').get(name) as Row | undefined;
  return r ? toView(r) : null;
}

function cleanName(name: string): string {
  const n = name.trim();
  if (!n) throw appError('nombre', 'La figura necesita un nombre');
  if (n.length > 60) throw appError('nombre', 'Nombre demasiado largo (máx. 60)');
  return n;
}

/** Las figuras personalizadas se guardan globalmente para reutilizarlas en otros eventos. */
export function createPattern(db: Db, name: string, def: PatternDef): PatternView {
  const n = cleanName(name);
  let d: PatternDef;
  try { d = validatePatternDef(def); } catch (e) { throw appError('figura', (e as Error).message); }
  const r = db.prepare('INSERT INTO patterns (name, type, definition_json, is_builtin) VALUES (?, ?, ?, 0)').run(n, d.type, JSON.stringify(d));
  return getPattern(db, Number(r.lastInsertRowid)) as PatternView;
}

export function updatePattern(db: Db, id: number, name: string, def: PatternDef): void {
  const p = getPattern(db, id);
  if (!p) throw appError('figura', 'La figura no existe');
  if (p.isBuiltin) throw appError('figura', 'Las figuras precargadas no se editan; cree una copia');
  let d: PatternDef;
  try { d = validatePatternDef(def); } catch (e) { throw appError('figura', (e as Error).message); }
  db.prepare('UPDATE patterns SET name = ?, type = ?, definition_json = ? WHERE id = ?').run(cleanName(name), d.type, JSON.stringify(d), id);
}

export function removePattern(db: Db, id: number): void {
  const p = getPattern(db, id);
  if (!p) throw appError('figura', 'La figura no existe');
  if (p.isBuiltin) throw appError('figura', 'Las figuras precargadas no se pueden borrar');
  const used = db.prepare('SELECT COUNT(*) AS n FROM games WHERE pattern_id = ?').get(id) as { n: number };
  if (used.n > 0) throw appError('figura', `La figura se usa en ${used.n} juego(s); quítela de esos juegos primero`);
  db.prepare('DELETE FROM patterns WHERE id = ?').run(id);
}
