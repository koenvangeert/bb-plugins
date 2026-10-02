/** The subset of better-sqlite3 that node:sqlite also implements, so tests need no native build. */
export interface SqlDatabase {
  exec(sql: string): unknown
  prepare(sql: string): {
    run(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
  }
}

/** Append-only: `bb.storage.migrate` keys each statement by its position. */
export const MIGRATIONS = [
  `CREATE TABLE tickets (
    key TEXT PRIMARY KEY,
    summary TEXT NOT NULL,
    status TEXT NOT NULL,
    status_category TEXT NOT NULL,
    issue_type TEXT NOT NULL,
    url TEXT NOT NULL,
    position INTEGER NOT NULL
  )`,
  `CREATE TABLE refresh_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    refreshed_at REAL,
    error TEXT,
    health TEXT NOT NULL,
    limit_reached INTEGER NOT NULL
  )`,
  `CREATE TABLE thread_links (
    thread_id TEXT PRIMARY KEY,
    issue_key TEXT NOT NULL
  )`,
  `CREATE INDEX thread_links_issue_key ON thread_links (issue_key)`,
]
