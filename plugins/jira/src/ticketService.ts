import { authStatusArgs, searchArgs, viewArgs, type AcliRunner } from './acli'
import { AcliError, classifyFailure } from './acliErrors'
import type { SqlDatabase } from './database'
import { errorMessage } from './errorMessage'
import {
  InvalidKeyError,
  isTicketKey,
  parseSearch,
  parseSiteUrl,
  parseView,
  TICKET_LIMIT,
  type Ticket,
  type TicketDetail,
} from './tickets'

export const VIEW_CACHE_MS = 5 * 60_000

export type Health = 'ok' | 'missing' | 'loggedOut'

export interface TicketSnapshot {
  tickets: Ticket[]
  refreshedAt: number | null
  error: string | null
  health: Health
  limitReached: boolean
  refreshing: boolean
}

export interface TicketService {
  snapshot(): TicketSnapshot
  refresh(): Promise<TicketSnapshot>
  ticket(key: string): Promise<TicketDetail>
}

interface TicketRow {
  key: string
  summary: string
  status: string
  status_category: string
  issue_type: string
  url: string
}

interface StateRow {
  refreshed_at: number | null
  error: string | null
  health: Health
  limit_reached: number
}

export function createTicketService(options: {
  db: SqlDatabase
  acli: AcliRunner
  readJql(): Promise<string>
  now(): number
  onHealth?(health: Health, message: string | null): void
}): TicketService {
  const { db, acli, readJql, now, onHealth } = options
  let running: Promise<TicketSnapshot> | null = null
  let siteUrl: Promise<string | undefined> | null = null
  let reportedHealth: Health = 'ok'
  const viewCache = new Map<string, { at: number; result: Promise<TicketDetail> }>()

  const readState = (): StateRow => {
    const [row] = db
      .prepare('SELECT refreshed_at, error, health, limit_reached FROM refresh_state WHERE id = 1')
      .all() as StateRow[]
    return row ?? { refreshed_at: null, error: null, health: 'ok', limit_reached: 0 }
  }

  const writeState = (state: StateRow) => {
    db.prepare(
      `INSERT INTO refresh_state (id, refreshed_at, error, health, limit_reached) VALUES (1, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET refreshed_at = excluded.refreshed_at, error = excluded.error,
         health = excluded.health, limit_reached = excluded.limit_reached`,
    ).run(state.refreshed_at, state.error, state.health, state.limit_reached)
  }

  const replaceTickets = (tickets: Ticket[], limitReached: boolean) => {
    db.exec('BEGIN')
    try {
      db.prepare('DELETE FROM tickets').run()
      const insert = db.prepare(
        'INSERT INTO tickets (key, summary, status, status_category, issue_type, url, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      tickets.forEach((ticket, position) =>
        insert.run(ticket.key, ticket.summary, ticket.status, ticket.statusCategory, ticket.issueType, ticket.url, position),
      )
      writeState({ refreshed_at: now(), error: null, health: 'ok', limit_reached: limitReached ? 1 : 0 })
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  const snapshot = (): TicketSnapshot => {
    const rows = db
      .prepare('SELECT key, summary, status, status_category, issue_type, url FROM tickets ORDER BY position')
      .all() as TicketRow[]
    const state = readState()
    return {
      tickets: rows.map((row) => ({
        key: row.key,
        summary: row.summary,
        status: row.status,
        statusCategory: row.status_category,
        issueType: row.issue_type,
        url: row.url,
      })),
      refreshedAt: state.refreshed_at,
      error: state.error,
      health: state.health,
      limitReached: state.limit_reached === 1,
      refreshing: running !== null,
    }
  }

  const resolveSiteUrl = (): Promise<string | undefined> => {
    siteUrl ??= acli.run(authStatusArgs()).then((result) => {
      const site = classifyFailure(result, 'auth') ? undefined : parseSiteUrl(result.stdout)
      if (!site) siteUrl = null
      return site
    })
    return siteUrl
  }

  const report = (health: Health, message: string | null) => {
    if (health !== reportedHealth) onHealth?.(health, message)
    reportedHealth = health
  }

  const refreshNow = async (): Promise<TicketSnapshot> => {
    const previous = readState()
    try {
      const result = await acli.run(searchArgs(await readJql(), TICKET_LIMIT + 1))
      const failure = classifyFailure(result, 'search')
      if (failure) throw failure
      const tickets = parseSearch(result.stdout, await resolveSiteUrl())
      replaceTickets(tickets.slice(0, TICKET_LIMIT), tickets.length > TICKET_LIMIT)
      report('ok', null)
    } catch (error) {
      const message = errorMessage(error)
      const health = healthOf(error) ?? previous.health
      if (health === 'loggedOut') siteUrl = null
      writeState({ ...previous, error: message, health })
      report(health, message)
    }
    return snapshot()
  }

  const viewNow = async (key: string): Promise<TicketDetail> => {
    const result = await acli.run(viewArgs(key))
    const failure = classifyFailure(result, 'view')
    if (failure) throw failure
    return parseView(result.stdout, await resolveSiteUrl())
  }

  return {
    snapshot,
    refresh() {
      running ??= refreshNow().finally(() => {
        running = null
      })
      return running
    },
    ticket(key) {
      if (!isTicketKey(key)) return Promise.reject(new InvalidKeyError(key))
      const cached = viewCache.get(key)
      if (cached && now() - cached.at < VIEW_CACHE_MS) return cached.result
      const result = viewNow(key)
      viewCache.set(key, { at: now(), result })
      result.catch(() => viewCache.delete(key))
      return result
    },
  }
}

function healthOf(error: unknown): Health | null {
  if (error instanceof AcliError && (error.kind === 'missing' || error.kind === 'loggedOut')) return error.kind
  return null
}
