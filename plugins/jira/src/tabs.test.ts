import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { MIGRATIONS } from './database'
import { EMPTY_VALUE, type Filter } from './filterFields'
import { createTabStore, TabNotFoundError, type TabValues } from './tabs'
import { migratedDatabase } from './testDatabase'
import type { Ticket } from './tickets'

const ticket = (key: string): Ticket => ({
  key,
  summary: `Summary ${key}`,
  status: 'To Do',
  statusCategory: 'new',
  issueType: 'Story',
  url: '',
})

const OLD_SCHEMA_LENGTH = 4
const TABS_SCHEMA_LENGTH = 9

const statusFilter: Filter = { field: 'status', label: 'Status', operator: 'in', values: [{ label: 'To Do', jql: '"To Do"' }] }

const NO_VALUES: TabValues = { fieldValues: {}, valuesLimitReached: false }

const values: TabValues = { fieldValues: { status: [{ label: 'To Do', jql: '"To Do"' }, EMPTY_VALUE] }, valuesLimitReached: true }

describe('migrations', () => {
  it('run on a fresh database', () => {
    expect(() => migratedDatabase()).not.toThrow()
  })

  it('run on a database with the old single-list schema and keep the thread links', () => {
    const db = new DatabaseSync(':memory:')
    for (const statement of MIGRATIONS.slice(0, OLD_SCHEMA_LENGTH)) db.exec(statement)
    db.prepare("INSERT INTO tickets VALUES ('ABC-1', 's', 'st', 'new', 'Story', '', 0)").run()
    db.prepare("INSERT INTO thread_links VALUES ('thr_1', 'ABC-1')").run()

    for (const statement of MIGRATIONS.slice(OLD_SCHEMA_LENGTH)) db.exec(statement)

    expect(db.prepare('SELECT thread_id, issue_key FROM thread_links').all()).toEqual([{ thread_id: 'thr_1', issue_key: 'ABC-1' }])
    expect(createTabStore(db).list()).toEqual([])
  })

  it('give the tabs of the tabs schema no filters and no values', () => {
    const db = new DatabaseSync(':memory:')
    for (const statement of MIGRATIONS.slice(0, TABS_SCHEMA_LENGTH)) db.exec(statement)
    db.prepare("INSERT INTO tabs (name, jql) VALUES ('Mine', 'q')").run()
    db.prepare('INSERT INTO tab_state (tab_id, refreshed_at, error, limit_reached) VALUES (1, 5, NULL, 0)').run()

    for (const statement of MIGRATIONS.slice(TABS_SCHEMA_LENGTH)) db.exec(statement)

    const tabs = createTabStore(db)
    expect(tabs.list()).toEqual([{ id: 1, name: 'Mine', jql: 'q', filters: [] }])
    expect(tabs.state(1)).toMatchObject({ fieldValues: {}, valuesLimitReached: false })
  })
})

describe('tab store', () => {
  it('lists tabs in the order they were added', () => {
    const tabs = createTabStore(migratedDatabase())

    tabs.insert('My tickets', 'assignee = currentUser()')
    tabs.insert('Warning', 'duedate < now()')

    expect(tabs.list().map((tab) => tab.name)).toEqual(['My tickets', 'Warning'])
  })

  it('renames a tab and keeps its tickets', () => {
    const tabs = createTabStore(migratedDatabase())
    const tab = tabs.insert('Warning', 'duedate < now()', { tickets: [ticket('ABC-1')], limitReached: false, refreshedAt: 5, values: NO_VALUES })

    tabs.update(tab, 'Overdue', tab.jql)

    expect(tabs.list()).toEqual([{ ...tab, name: 'Overdue' }])
    expect(tabs.tickets(tab.id).map((entry) => entry.key)).toEqual(['ABC-1'])
  })

  it('changes the query of a tab with its first list', () => {
    const tabs = createTabStore(migratedDatabase())
    const tab = tabs.insert('Warning', 'old', { tickets: [ticket('ABC-1')], limitReached: false, refreshedAt: 5, values: NO_VALUES })

    tabs.update(tab, 'Warning', 'new', { tickets: [ticket('ABC-2')], limitReached: true, refreshedAt: 9, values: NO_VALUES })

    expect(tabs.get(tab.id)!.jql).toBe('new')
    expect(tabs.tickets(tab.id).map((entry) => entry.key)).toEqual(['ABC-2'])
    expect(tabs.state(tab.id)).toMatchObject({ refreshedAt: 9, error: null, limitReached: true })
  })

  it('deletes a tab with its tickets and state, and leaves thread links alone', () => {
    const db = migratedDatabase()
    db.prepare("INSERT INTO thread_links VALUES ('thr_1', 'ABC-1')").run()
    const tabs = createTabStore(db)
    const tab = tabs.insert('Warning', 'q', { tickets: [ticket('ABC-1')], limitReached: false, refreshedAt: 5, values: NO_VALUES })

    tabs.delete(tab.id)

    expect(tabs.list()).toEqual([])
    expect(db.prepare('SELECT COUNT(*) AS n FROM tab_tickets').all()).toEqual([{ n: 0 }])
    expect(db.prepare('SELECT COUNT(*) AS n FROM tab_state').all()).toEqual([{ n: 0 }])
    expect(db.prepare('SELECT issue_key FROM thread_links').all()).toEqual([{ issue_key: 'ABC-1' }])
  })

  it('has no list and no state for a tab that was never read', () => {
    const tabs = createTabStore(migratedDatabase())
    const tab = tabs.insert('Warning', 'q')

    expect(tabs.tickets(tab.id)).toEqual([])
    expect(tabs.state(tab.id)).toMatchObject({ refreshedAt: null, error: null, limitReached: false })
  })

  it('keeps the last good list when it records an error', () => {
    const tabs = createTabStore(migratedDatabase())
    const tab = tabs.insert('Warning', 'q', { tickets: [ticket('ABC-1')], limitReached: false, refreshedAt: 5, values: NO_VALUES })

    tabs.recordError(tab, 'bad JQL')

    expect(tabs.tickets(tab.id)).toHaveLength(1)
    expect(tabs.state(tab.id)).toMatchObject({ refreshedAt: 5, error: 'bad JQL', limitReached: false })
  })

  it('clears the error on the next good list', () => {
    const tabs = createTabStore(migratedDatabase())
    const tab = tabs.insert('Warning', 'q')
    tabs.recordError(tab, 'bad JQL')

    tabs.recordList(tab, { tickets: [], limitReached: false, refreshedAt: 7, values: NO_VALUES })

    expect(tabs.state(tab.id)).toMatchObject({ refreshedAt: 7, error: null, limitReached: false })
  })

  it('drops a list or an error for a tab that was deleted or whose query changed', () => {
    const tabs = createTabStore(migratedDatabase())
    const deleted = tabs.insert('Gone', 'q')
    const changed = tabs.insert('Changed', 'old')
    tabs.delete(deleted.id)
    tabs.update(changed, 'Changed', 'new', { tickets: [ticket('ABC-2')], limitReached: false, refreshedAt: 1, values: NO_VALUES })

    tabs.recordList(deleted, { tickets: [ticket('ABC-1')], limitReached: false, refreshedAt: 2, values: NO_VALUES })
    tabs.recordList(changed, { tickets: [ticket('ABC-1')], limitReached: false, refreshedAt: 2, values: NO_VALUES })
    tabs.recordError(changed, 'stale error')

    expect(tabs.tickets(changed.id).map((entry) => entry.key)).toEqual(['ABC-2'])
    expect(tabs.state(changed.id).error).toBeNull()
    expect(tabs.state(deleted.id)).toMatchObject({ refreshedAt: null, error: null, limitReached: false })
  })

  it('rejects an update of a tab that was deleted or changed since it was read, and writes nothing', () => {
    const db = migratedDatabase()
    const tabs = createTabStore(db)
    const tab = tabs.insert('Warning', 'q')
    tabs.delete(tab.id)

    expect(() => tabs.update(tab, 'Warning', 'new', { tickets: [ticket('ABC-1')], limitReached: false, refreshedAt: 1, values: NO_VALUES })).toThrow(
      TabNotFoundError,
    )
    expect(db.prepare('SELECT COUNT(*) AS n FROM tab_tickets').all()).toEqual([{ n: 0 }])
    expect(tabs.allTickets()).toEqual([])
  })

  it('saves the filters of a tab with their list, and keeps them on a reread, a rename, and a query change', () => {
    const tabs = createTabStore(migratedDatabase())
    const tab = tabs.insert('Ready', 'q')

    tabs.setFilters(tab, [statusFilter], { tickets: [ticket('ABC-1')], limitReached: false, refreshedAt: 5, values: NO_VALUES })
    const filtered = tabs.get(tab.id)!
    tabs.update(filtered, 'Ready to pick up', 'new q')

    expect(tabs.get(tab.id)).toEqual({ id: tab.id, name: 'Ready to pick up', jql: 'new q', filters: [statusFilter] })
    expect(tabs.tickets(tab.id).map((entry) => entry.key)).toEqual(['ABC-1'])
  })

  it('writes the values with a list, and keeps them when an error is recorded', () => {
    const tabs = createTabStore(migratedDatabase())
    const tab = tabs.insert('Ready', 'q', { tickets: [], limitReached: false, refreshedAt: 1, values })

    tabs.recordError(tab, 'bad JQL')

    expect(tabs.state(tab.id)).toMatchObject(values)
  })

  it('drops a list for a tab whose filters changed, and rejects filters for a stale tab', () => {
    const tabs = createTabStore(migratedDatabase())
    const tab = tabs.insert('Ready', 'q', { tickets: [ticket('ABC-1')], limitReached: false, refreshedAt: 1, values: NO_VALUES })
    tabs.setFilters(tab, [statusFilter], { tickets: [ticket('ABC-2')], limitReached: false, refreshedAt: 2, values: NO_VALUES })

    tabs.recordList(tab, { tickets: [ticket('ABC-3')], limitReached: false, refreshedAt: 3, values: NO_VALUES })

    expect(tabs.tickets(tab.id).map((entry) => entry.key)).toEqual(['ABC-2'])
    expect(() => tabs.setFilters(tab, [], { tickets: [], limitReached: false, refreshedAt: 4, values: NO_VALUES })).toThrow(TabNotFoundError)
  })

  it('deletes the values with the tab', () => {
    const tabs = createTabStore(migratedDatabase())
    const tab = tabs.insert('Ready', 'q', { tickets: [], limitReached: false, refreshedAt: 1, values })

    tabs.delete(tab.id)

    expect(tabs.state(tab.id)).toMatchObject({ fieldValues: {}, valuesLimitReached: false })
  })

  it('lists the tickets of all tabs once each, in tab order', () => {
    const tabs = createTabStore(migratedDatabase())
    tabs.insert('Mine', 'a', { tickets: [ticket('ABC-1'), ticket('ABC-2')], limitReached: false, refreshedAt: 1, values: NO_VALUES })
    tabs.insert('Release', 'b', { tickets: [ticket('ABC-3'), ticket('ABC-1')], limitReached: false, refreshedAt: 1, values: NO_VALUES })

    expect(tabs.allTickets().map((entry) => entry.key)).toEqual(['ABC-1', 'ABC-2', 'ABC-3'])
  })

  it('seeds the first tab once, and not again after all tabs are deleted', () => {
    const tabs = createTabStore(migratedDatabase())

    tabs.seedFirstTab()
    tabs.seedFirstTab()
    expect(tabs.list()).toEqual([
      { id: expect.any(Number), name: 'My tickets', jql: 'assignee = currentUser() AND statusCategory != Done', filters: [] },
    ])

    tabs.delete(tabs.list()[0]!.id)
    tabs.seedFirstTab()
    expect(tabs.list()).toEqual([])
  })
})
