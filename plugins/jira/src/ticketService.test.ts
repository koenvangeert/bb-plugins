import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { fakeAcli } from './fakeAcli'
import searchFixture from './fixtures/search.json'
import viewFixture from './fixtures/view.json'
import { migratedDatabase } from './testDatabase'
import { InvalidKeyError, TICKET_LIMIT } from './tickets'
import { createTicketService, VIEW_CACHE_MS } from './ticketService'

const SEARCH_OK = { stdout: JSON.stringify(searchFixture) }
const LOGGED_OUT = { exitCode: 1, stderr: "✗ Error: unauthorized: use 'acli jira auth login' to authenticate" }

function service(acli = fakeAcli({ search: SEARCH_OK }), onHealth = vi.fn(), now = () => 1_000) {
  const db = migratedDatabase()
  return { db, onHealth, acli, tickets: createTicketService({ db, acli: acli.runner, readJql: async () => 'my jql', now, onHealth }) }
}

describe('ticket service', () => {
  it('starts empty before the first refresh', () => {
    expect(service().tickets.snapshot()).toMatchObject({ tickets: [], refreshedAt: null, error: null, health: 'ok' })
  })

  it('stores the tickets from a refresh in query order', async () => {
    const { tickets, acli } = service()

    const snapshot = await tickets.refresh()

    expect(snapshot.tickets.map((ticket) => ticket.key)).toEqual(['ABC-12', 'ABC-40', 'ABC-77'])
    expect(snapshot).toMatchObject({ refreshedAt: 1_000, error: null, health: 'ok', limitReached: false })
    expect(acli.calls[0]).toContain('my jql')
  })

  it('keeps the last good list and stores the error when a refresh fails', async () => {
    let fail = false
    const acli = fakeAcli({ search: () => (fail ? { exitCode: 1, stderr: 'connection reset' } : SEARCH_OK) })
    let clock = 1_000
    const { tickets } = service(acli, vi.fn(), () => clock)
    await tickets.refresh()
    fail = true
    clock = 2_000

    const snapshot = await tickets.refresh()

    expect(snapshot.tickets).toHaveLength(3)
    expect(snapshot).toMatchObject({ refreshedAt: 1_000, error: 'connection reset', health: 'ok' })
  })

  it('replaces the list on the next good refresh', async () => {
    let result = SEARCH_OK
    const { tickets } = service(fakeAcli({ search: () => result }))
    await tickets.refresh()
    result = { stdout: JSON.stringify([searchFixture[1]]) }

    expect((await tickets.refresh()).tickets.map((ticket) => ticket.key)).toEqual(['ABC-40'])
  })

  it('runs acli once when a manual refresh joins a running refresh', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const acli = fakeAcli({ search: async () => (await gate, SEARCH_OK) })
    const { tickets } = service(acli)

    const first = tickets.refresh()
    expect(tickets.snapshot().refreshing).toBe(true)
    const second = tickets.refresh()
    release()

    expect(await second).toEqual(await first)
    expect(acli.calls.filter((args) => args[2] === 'search')).toHaveLength(1)
    expect(tickets.snapshot().refreshing).toBe(false)
  })

  it('reports a logged-out acli once, and recovery after the next good refresh', async () => {
    let result: object = LOGGED_OUT
    const { tickets, onHealth } = service(fakeAcli({ search: () => result }))

    expect(await tickets.refresh()).toMatchObject({ health: 'loggedOut', error: expect.stringContaining('acli jira auth login') })
    expect(onHealth).toHaveBeenLastCalledWith('loggedOut', expect.stringContaining('acli jira auth login'))

    result = SEARCH_OK
    expect(await tickets.refresh()).toMatchObject({ health: 'ok', error: null })
    expect(onHealth).toHaveBeenLastCalledWith('ok', null)
  })

  it('reports a missing acli', async () => {
    const { tickets, onHealth } = service(fakeAcli({ search: { exitCode: -1, spawnError: 'ENOENT' } }))

    expect(await tickets.refresh()).toMatchObject({ health: 'missing' })
    expect(onHealth).toHaveBeenCalledWith('missing', expect.stringContaining('not installed'))
  })

  it('does not report health for an ordinary failure', async () => {
    const { tickets, onHealth } = service(fakeAcli({ search: { exitCode: 1, stderr: 'bad JQL' } }))

    await tickets.refresh()

    expect(onHealth).not.toHaveBeenCalled()
  })

  const issues = (count: number) =>
    JSON.stringify(Array.from({ length: count }, (_, index) => ({ ...searchFixture[0], key: `ABC-${index + 1}` })))

  it('asks for one ticket more than the limit, keeps the limit, and flags the cut', async () => {
    const acli = fakeAcli({ search: { stdout: issues(TICKET_LIMIT + 1) } })
    const { tickets } = service(acli)

    const snapshot = await tickets.refresh()

    expect(acli.calls[0]).toEqual(expect.arrayContaining(['--limit', String(TICKET_LIMIT + 1)]))
    expect(snapshot.tickets).toHaveLength(TICKET_LIMIT)
    expect(snapshot.limitReached).toBe(true)
  })

  it('does not flag a list of exactly the limit', async () => {
    const { tickets } = service(fakeAcli({ search: { stdout: issues(TICKET_LIMIT) } }))

    expect((await tickets.refresh()).limitReached).toBe(false)
  })

  it('keeps a logged-out state through an ordinary failure', async () => {
    let result: object = LOGGED_OUT
    const { tickets, onHealth } = service(fakeAcli({ search: () => result }))
    await tickets.refresh()
    result = { timedOut: true, exitCode: -1 }

    expect(await tickets.refresh()).toMatchObject({ health: 'loggedOut', error: expect.stringContaining('30 seconds') })
    expect(onHealth).toHaveBeenCalledTimes(1)
  })

  it('builds browse URLs from the acli site and reads the site once', async () => {
    const acli = fakeAcli({
      search: SEARCH_OK,
      auth: { stdout: readFileSync(new URL('./fixtures/auth-status.txt', import.meta.url), 'utf8') },
    })
    const { tickets } = service(acli)

    expect((await tickets.refresh()).tickets[0]!.url).toBe('https://example.atlassian.net/browse/ABC-12')
    await tickets.refresh()
    expect(acli.calls.filter((args) => args[1] === 'auth')).toHaveLength(1)
  })

  it('reads one ticket with its description', async () => {
    const { tickets, acli } = service(fakeAcli({ view: { stdout: JSON.stringify(viewFixture) } }))

    expect(await tickets.ticket('ABC-12')).toMatchObject({ key: 'ABC-12', description: expect.stringContaining('password reset') })
    expect(acli.calls[0]!.slice(0, 4)).toEqual(['jira', 'workitem', 'view', 'ABC-12'])
  })

  it('reuses a ticket read within the cache window', async () => {
    let clock = 1_000
    const acli = fakeAcli({ view: { stdout: JSON.stringify(viewFixture) } })
    const { tickets } = service(acli, vi.fn(), () => clock)

    await tickets.ticket('ABC-12')
    await tickets.ticket('ABC-12')
    clock += VIEW_CACHE_MS
    await tickets.ticket('ABC-12')

    expect(acli.calls.filter((args) => args[2] === 'view')).toHaveLength(2)
  })

  it('reads a ticket again after a failed read', async () => {
    let fail = true
    const acli = fakeAcli({ view: () => (fail ? { timedOut: true, exitCode: -1 } : { stdout: JSON.stringify(viewFixture) }) })
    const { tickets } = service(acli)

    await expect(tickets.ticket('ABC-12')).rejects.toMatchObject({ kind: 'timeout' })
    fail = false

    expect(await tickets.ticket('ABC-12')).toMatchObject({ key: 'ABC-12' })
  })

  it('reports a stored logged-out state again after a plugin reload', async () => {
    const db = migratedDatabase()
    const acli = fakeAcli({ search: LOGGED_OUT })
    await createTicketService({ db, acli: acli.runner, readJql: async () => 'jql', now: () => 1 }).refresh()
    const onHealth = vi.fn()

    await createTicketService({ db, acli: acli.runner, readJql: async () => 'jql', now: () => 2, onHealth }).refresh()

    expect(onHealth).toHaveBeenCalledWith('loggedOut', expect.stringContaining('acli jira auth login'))
  })

  it('reads the site once for parallel reads, and again after a logout', async () => {
    let search: object = SEARCH_OK
    const acli = fakeAcli({
      search: () => search,
      view: { stdout: JSON.stringify(viewFixture) },
      auth: { stdout: readFileSync(new URL('./fixtures/auth-status.txt', import.meta.url), 'utf8') },
    })
    const { tickets } = service(acli)
    const authCalls = () => acli.calls.filter((args) => args[1] === 'auth').length

    await Promise.all([tickets.refresh(), tickets.ticket('ABC-12')])
    expect(authCalls()).toBe(1)

    search = LOGGED_OUT
    await tickets.refresh()
    search = SEARCH_OK
    await tickets.refresh()
    expect(authCalls()).toBe(2)
  })

  it('rejects text that is not a key without calling acli', async () => {
    const { tickets, acli } = service()

    await expect(tickets.ticket('--web')).rejects.toBeInstanceOf(InvalidKeyError)
    expect(acli.calls).toHaveLength(0)
  })

  it('rejects an unknown ticket as not found', async () => {
    const { tickets } = service(fakeAcli({ view: { exitCode: 1, stderr: 'Work item NOPE-1 does not exist' } }))

    await expect(tickets.ticket('NOPE-1')).rejects.toMatchObject({ kind: 'notFound' })
  })
})
