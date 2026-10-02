import { authStatusArgs, searchArgs, viewArgs, type AcliRunner } from './acli'
import { AcliError, classifyFailure } from './acliErrors'
import type { SqlDatabase } from './database'
import { errorMessage } from './errorMessage'
import type { Filter } from './filterFields'
import { effectiveJql } from './filterJql'
import {
  fieldValues,
  InvalidKeyError,
  isTicketKey,
  parseSearch,
  parseSiteUrl,
  parseView,
  TICKET_LIMIT,
  type SearchIssue,
  type Ticket,
  type TicketDetail,
} from './tickets'
import { TabNotFoundError, type Tab, type TabList, type TabStore, type TabValues } from './tabs'

export const VIEW_CACHE_MS = 5 * 60_000

export type Health = 'ok' | 'missing' | 'loggedOut'

export interface TabSnapshot extends Tab, TabValues {
  tickets: Ticket[]
  refreshedAt: number | null
  error: string | null
  limitReached: boolean
}

interface SearchResult {
  issues: SearchIssue[]
  limitReached: boolean
}

export interface TicketSnapshot {
  tabs: TabSnapshot[]
  health: Health
  refreshing: boolean
}

export interface TabInput {
  id?: number
  name: string
  jql: string
}

export interface FiltersInput {
  id: number
  filters: Filter[]
}

export interface TicketService {
  snapshot(): TicketSnapshot
  refresh(): Promise<TicketSnapshot>
  saveTab(input: TabInput): Promise<TicketSnapshot>
  setFilters(input: FiltersInput): Promise<TicketSnapshot>
  deleteTab(id: number): TicketSnapshot
  allTickets(): Ticket[]
  ticket(key: string): Promise<TicketDetail>
}

export function createTicketService(options: {
  db: SqlDatabase
  tabs: TabStore
  acli: AcliRunner
  now(): number
  onHealth?(health: Health, message: string | null): void
}): TicketService {
  const { db, tabs, acli, now, onHealth } = options
  let running: Promise<TicketSnapshot> | null = null
  let siteUrl: Promise<string | undefined> | null = null
  let reportedHealth: Health = 'ok'
  const viewCache = new Map<string, { at: number; result: Promise<TicketDetail> }>()

  const readHealth = (): Health => {
    const [row] = db.prepare('SELECT health FROM refresh_state WHERE id = 1').all() as { health: Health }[]
    return row?.health ?? 'ok'
  }

  const writeHealth = (health: Health) => {
    db.prepare(
      `INSERT INTO refresh_state (id, refreshed_at, error, health, limit_reached) VALUES (1, NULL, NULL, ?, 0)
       ON CONFLICT (id) DO UPDATE SET health = excluded.health`,
    ).run(health)
  }

  const snapshot = (): TicketSnapshot => ({
    tabs: tabs.list().map((tab) => ({ ...tab, tickets: tabs.tickets(tab.id), ...tabs.state(tab.id), ...tabs.values(tab.id) })),
    health: readHealth(),
    refreshing: running !== null,
  })

  const resolveSiteUrl = (): Promise<string | undefined> => {
    siteUrl ??= acli.run(authStatusArgs()).then((result) => {
      const site = classifyFailure(result, 'auth') ? undefined : parseSiteUrl(result.stdout)
      if (!site) siteUrl = null
      return site
    })
    return siteUrl
  }

  const setHealth = (health: Health, message: string | null) => {
    if (health === 'loggedOut') siteUrl = null
    writeHealth(health)
    if (health !== reportedHealth) onHealth?.(health, message)
    reportedHealth = health
  }

  const searchAndTrackHealth = async (jql: string): Promise<SearchResult> => {
    try {
      const result = await search(jql)
      setHealth('ok', null)
      return result
    } catch (error) {
      const failedHealth = healthOf(error)
      if (failedHealth) setHealth(failedHealth, errorMessage(error))
      throw error
    }
  }

  const search = async (jql: string): Promise<SearchResult> => {
    const result = await acli.run(searchArgs(jql, TICKET_LIMIT + 1))
    const failure = classifyFailure(result, 'search')
    if (failure) throw failure
    const found = parseSearch(result.stdout, await resolveSiteUrl())
    return { issues: found.slice(0, TICKET_LIMIT), limitReached: found.length > TICKET_LIMIT }
  }

  const listOf = (result: SearchResult, values: TabValues): TabList => ({
    tickets: result.issues.map((issue) => issue.ticket),
    limitReached: result.limitReached,
    refreshedAt: now(),
    values,
  })

  const readTab = async ({ jql, filters }: Pick<Tab, 'jql' | 'filters'>): Promise<TabList> => {
    const base = await searchAndTrackHealth(jql)
    const values = { fieldValues: fieldValues(base.issues), valuesLimitReached: base.limitReached }
    if (filters.length === 0) return listOf(base, values)
    return listOf(await searchAndTrackHealth(effectiveJql(jql, filters)), values)
  }

  const refreshNow = async (): Promise<TicketSnapshot> => {
    for (const tab of tabs.list()) {
      try {
        tabs.recordList(tab, await readTab(tab))
      } catch (error) {
        tabs.recordError(tab, errorMessage(error))
        if (healthOf(error)) break
      }
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
    async saveTab({ id, name, jql }) {
      if (id === undefined) {
        tabs.insert(name, jql, await readTab({ jql, filters: [] }))
        return snapshot()
      }
      const existing = tabs.get(id)
      if (!existing) throw new TabNotFoundError(id)
      tabs.update(existing, name, jql, jql === existing.jql ? undefined : await readTab({ ...existing, jql }))
      return snapshot()
    },
    async setFilters({ id, filters }) {
      const existing = tabs.get(id)
      if (!existing) throw new TabNotFoundError(id)
      const list =
        filters.length === 0
          ? await readTab({ jql: existing.jql, filters })
          : listOf(await searchAndTrackHealth(effectiveJql(existing.jql, filters)), tabs.values(id))
      tabs.setFilters(existing, filters, list)
      return snapshot()
    },
    deleteTab(id) {
      tabs.delete(id)
      return snapshot()
    },
    allTickets: () => tabs.allTickets(),
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
