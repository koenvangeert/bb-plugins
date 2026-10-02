import { inTransaction, type SqlDatabase } from './database'
import type { Ticket } from './tickets'

export const FIRST_TAB = { name: 'My tickets', jql: 'assignee = currentUser() AND statusCategory != Done' }

export class TabNotFoundError extends Error {
  constructor(id: number) {
    super(`Tab ${id} does not exist. Reload the Jira page.`)
    this.name = 'TabNotFoundError'
  }
}

export interface Tab {
  id: number
  name: string
  jql: string
}

export interface TabState {
  refreshedAt: number | null
  error: string | null
  limitReached: boolean
}

export interface TabList {
  tickets: Ticket[]
  limitReached: boolean
  refreshedAt: number
}

interface TicketRow {
  key: string
  summary: string
  status: string
  status_category: string
  issue_type: string
  url: string
}

const TICKET_COLUMNS = 'key, summary, status, status_category, issue_type, url'

export function createTabStore(db: SqlDatabase) {
  const get = (id: number): Tab | null => {
    const [row] = db.prepare('SELECT id, name, jql FROM tabs WHERE id = ?').all(id) as Tab[]
    return row ?? null
  }

  const isCurrent = (tab: Tab) => db.prepare('SELECT 1 FROM tabs WHERE id = ? AND jql = ?').all(tab.id, tab.jql).length > 0

  const writeList = (tabId: number, list: TabList) => {
    db.prepare('DELETE FROM tab_tickets WHERE tab_id = ?').run(tabId)
    const insert = db.prepare(
      `INSERT INTO tab_tickets (tab_id, ${TICKET_COLUMNS}, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    list.tickets.forEach((ticket, position) =>
      insert.run(tabId, ticket.key, ticket.summary, ticket.status, ticket.statusCategory, ticket.issueType, ticket.url, position),
    )
    db.prepare(
      `INSERT INTO tab_state (tab_id, refreshed_at, error, limit_reached) VALUES (?, ?, NULL, ?)
       ON CONFLICT (tab_id) DO UPDATE SET refreshed_at = excluded.refreshed_at, error = NULL, limit_reached = excluded.limit_reached`,
    ).run(tabId, list.refreshedAt, list.limitReached ? 1 : 0)
  }

  const insertTab = (name: string, jql: string): Tab =>
    (db.prepare('INSERT INTO tabs (name, jql) VALUES (?, ?) RETURNING id, name, jql').all(name, jql) as Tab[])[0]!

  return {
    get,

    list: (): Tab[] => db.prepare('SELECT id, name, jql FROM tabs ORDER BY id').all() as Tab[],

    insert: (name: string, jql: string, list?: TabList): Tab =>
      inTransaction(db, () => {
        const tab = insertTab(name, jql)
        if (list) writeList(tab.id, list)
        return tab
      }),

    update(tab: Tab, name: string, jql: string, list?: TabList): void {
      inTransaction(db, () => {
        if (!isCurrent(tab)) throw new TabNotFoundError(tab.id)
        db.prepare('UPDATE tabs SET name = ?, jql = ? WHERE id = ?').run(name, jql, tab.id)
        if (list) writeList(tab.id, list)
      })
    },

    delete(id: number): void {
      inTransaction(db, () => {
        db.prepare('DELETE FROM tab_tickets WHERE tab_id = ?').run(id)
        db.prepare('DELETE FROM tab_state WHERE tab_id = ?').run(id)
        db.prepare('DELETE FROM tabs WHERE id = ?').run(id)
      })
    },

    recordList(tab: Tab, list: TabList): void {
      inTransaction(db, () => {
        if (isCurrent(tab)) writeList(tab.id, list)
      })
    },

    recordError(tab: Tab, error: string): void {
      inTransaction(db, () => {
        if (!isCurrent(tab)) return
        db.prepare(
          `INSERT INTO tab_state (tab_id, refreshed_at, error, limit_reached) VALUES (?, NULL, ?, 0)
           ON CONFLICT (tab_id) DO UPDATE SET error = excluded.error`,
        ).run(tab.id, error)
      })
    },

    tickets: (tabId: number): Ticket[] =>
      (db.prepare(`SELECT ${TICKET_COLUMNS} FROM tab_tickets WHERE tab_id = ? ORDER BY position`).all(tabId) as TicketRow[]).map(
        toTicket,
      ),

    state(tabId: number): TabState {
      const [row] = db.prepare('SELECT refreshed_at, error, limit_reached FROM tab_state WHERE tab_id = ?').all(tabId) as {
        refreshed_at: number | null
        error: string | null
        limit_reached: number
      }[]
      return { refreshedAt: row?.refreshed_at ?? null, error: row?.error ?? null, limitReached: row?.limit_reached === 1 }
    },

    allTickets(): Ticket[] {
      const rows = db
        .prepare(`SELECT ${TICKET_COLUMNS} FROM tab_tickets JOIN tabs ON tabs.id = tab_tickets.tab_id ORDER BY tab_id, position`)
        .all() as TicketRow[]
      const byKey = new Map<string, Ticket>()
      for (const row of rows) if (!byKey.has(row.key)) byKey.set(row.key, toTicket(row))
      return [...byKey.values()]
    },

    seedFirstTab(): void {
      inTransaction(db, () => {
        if (db.prepare('SELECT 1 FROM tab_seed').all().length > 0) return
        insertTab(FIRST_TAB.name, FIRST_TAB.jql)
        db.prepare('INSERT INTO tab_seed (id) VALUES (1)').run()
      })
    },
  }
}

export type TabStore = ReturnType<typeof createTabStore>

function toTicket(row: TicketRow): Ticket {
  return {
    key: row.key,
    summary: row.summary,
    status: row.status,
    statusCategory: row.status_category,
    issueType: row.issue_type,
    url: row.url,
  }
}
