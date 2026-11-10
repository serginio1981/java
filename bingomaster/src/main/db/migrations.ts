/**
 * Migraciones en orden. Nunca editar una ya publicada: agregar una nueva.
 * Nota: la columna de orden de games se llama "position" ("order" es palabra
 * reservada de SQL).
 */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE app_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE events (
    id               INTEGER PRIMARY KEY,
    name             TEXT NOT NULL,
    date             TEXT NOT NULL,
    series_code      TEXT NOT NULL,
    accumulate_calls INTEGER NOT NULL DEFAULT 1,
    current_game_id  INTEGER,
    created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE patterns (
    id              INTEGER PRIMARY KEY,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL CHECK (type IN ('mask', 'group', 'count')),
    definition_json TEXT NOT NULL,
    is_builtin      INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE games (
    id         INTEGER PRIMARY KEY,
    event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    position   INTEGER NOT NULL,
    name       TEXT NOT NULL,
    pattern_id INTEGER NOT NULL REFERENCES patterns(id),
    UNIQUE (event_id, position)
  );

  CREATE TABLE cards (
    id                INTEGER PRIMARY KEY,
    event_id          INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    series_code       TEXT NOT NULL,
    folio             TEXT NOT NULL,
    grid_json         TEXT NOT NULL,
    origin            TEXT NOT NULL CHECK (origin IN ('own', 'external')),
    source_image_path TEXT,
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (event_id, series_code, folio)
  );
  CREATE INDEX cards_folio ON cards(event_id, folio);

  CREATE TABLE calls (
    id        INTEGER PRIMARY KEY,
    event_id  INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    game_id   INTEGER REFERENCES games(id),
    number    INTEGER NOT NULL CHECK (number BETWEEN 1 AND 75),
    called_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX calls_event ON calls(event_id, id);

  CREATE TABLE winners (
    id          INTEGER PRIMARY KEY,
    event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    game_id     INTEGER NOT NULL REFERENCES games(id),
    card_id     INTEGER NOT NULL REFERENCES cards(id),
    calls_count INTEGER NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  `,
  // 2: notas de ganador (desempate), un cartón gana una vez por juego, folios propios numéricos.
  `
  ALTER TABLE winners ADD COLUMN note TEXT;
  CREATE UNIQUE INDEX winners_game_card ON winners(game_id, card_id);
  ALTER TABLE cards ADD COLUMN own_seq INTEGER;
  CREATE INDEX cards_own_seq ON cards(event_id, own_seq);
  CREATE UNIQUE INDEX patterns_builtin_name ON patterns(name) WHERE is_builtin = 1;
  `,
  // 3: juegos terminados (con o sin ganador).
  `
  ALTER TABLE games ADD COLUMN finished_at TEXT;
  `,
];
