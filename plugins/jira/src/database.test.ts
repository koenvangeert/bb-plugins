import { describe, expect, it } from 'vitest'
import { migratedDatabase } from './testDatabase'

describe('MIGRATIONS', () => {
  it('keeps the tickets table that older checkouts on the shared database still read', () => {
    const db = migratedDatabase()
    db.prepare(
      `INSERT INTO tickets (key, summary, status, status_category, issue_type, url, position)
       VALUES ('ABC-1', 's', 'To Do', 'new', 'Task', 'u', 0)`,
    ).run()
    expect(db.prepare('SELECT key FROM tickets').all()).toEqual([{ key: 'ABC-1' }])
  })
})
