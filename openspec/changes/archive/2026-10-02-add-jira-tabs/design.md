## Context

See proposal.md for motivation and `specs/jira-ticket-list/spec.md` for behavior.

Current state in `plugins/jira/`:

- `src/settings.ts` defines `jql` and `refreshMinutes`. The BB SDK settings types are `string`, `boolean`, `number`, `select`, and `project`. There is no list type.
- `src/ticketService.ts` runs one search, replaces the `tickets` table in one transaction, and writes one `refresh_state` row (`refreshed_at`, `error`, `health`, `limit_reached`). A single-flight guard joins a manual refresh to a running one.
- `src/database.ts` migrations are append only. `bb.storage.migrate` keys each statement by its position.
- `src/threadLinks.ts` finds a cached ticket through `tickets.snapshot().tickets`. Thread links are keyed by ticket key, so tabs do not touch them.
- `src/ui/ThreadTicket.tsx` builds the "Link Jira" picker from the `tickets` RPC.
- `components/ui/` has `dialog` and `input`. It has no tabs or alert-dialog component.

## Goals / Non-Goals

**Goals:**

- Tab CRUD and per-tab refresh are host-free and unit-tested with the fake `acli` runner, like the current ticket service.
- A refresh never writes a list under a tab whose query changed or that was deleted during that refresh.

**Non-Goals:**

- Parallel `acli` calls.
- Keeping the selected tab across page loads.

## Decisions

### 1. Tabs live in the plugin database

New table `tabs(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, jql TEXT NOT NULL)`. Tab order is `id` order, which is the order the user added them.

Alternative: a multiline setting with one `Name: JQL` per line, or a JSON setting. Rejected by the user: a typo shows only at the next refresh, and the page cannot test a query before it saves.

### 2. Per-tab cache: new tables, old ones dropped

New migrations, appended:

- `DROP TABLE tickets`
- `CREATE TABLE tab_tickets(tab_id, key, summary, status, status_category, issue_type, url, position, PRIMARY KEY (tab_id, key))`
- `CREATE TABLE tab_state(tab_id INTEGER PRIMARY KEY, refreshed_at REAL, error TEXT, limit_reached INTEGER NOT NULL)`
- `CREATE TABLE tab_seed(id INTEGER PRIMARY KEY CHECK (id = 1))`

`refresh_state` stays for the global `health` only. Its `refreshed_at`, `error`, and `limit_reached` columns are legacy: the plugin writes NULL or 0 and never reads them. Each tab has its own refresh time in `tab_state`, and the page header shows the time of the selected tab.

The plugin deletes `tab_tickets` and `tab_state` rows for a tab in the same transaction that deletes the tab. No foreign keys, because SQLite enforces them only with `PRAGMA foreign_keys`, and the current code does not set it.

Alternative: add a `tab_id` column to `tickets`. Rejected: the primary key must change from `key` to `(tab_id, key)`, and SQLite cannot change a primary key in place.

### 3. Seed the first tab once

At plugin start, in one transaction: if `tab_seed` has no row, insert a "My tickets" tab with `DEFAULT_JQL`, then insert the `tab_seed` row. A deleted tab set stays empty after a restart, because the seed row stays.

The `jql` descriptor leaves `SETTINGS`, so it no longer shows in plugin settings.

Alternative: copy the stored `jql` value. Rejected by the user: the SDK does not say if a removed setting stays readable, and the only install has `jql` at its default.

### 4. Ticket service: refresh per tab

`refresh()` keeps its single-flight guard and reads all tabs at the start. For each tab, one after the other:

1. Run `searchArgs(tab.jql, TICKET_LIMIT + 1)`.
2. On success, in one transaction: if the tab still exists with the same `jql`, replace its `tab_tickets` rows and write its `tab_state`. Else drop the result.
3. On failure, write only `error` to its `tab_state`, so the last good list stays.

`missing` and `loggedOut` stop the loop, because every other tab fails the same way. They set the global health as today. Health goes back to `ok` after any search runs, in a refresh or in a save (decision 5).

`snapshot()` returns `{ tabs: [{ id, name, jql, tickets, refreshedAt, error, limitReached }], health, refreshing }`.

`allTickets()` returns the tickets of all tabs, each key once, in tab order. `threadLinks` uses it instead of `snapshot().tickets`.

### 5. Save runs the query once

`saveTab({ id?, name, jql })`:

- New tab, or changed `jql`: run the search first. On failure, throw the classified `acli` error, so the RPC call fails with its text and nothing changes. On success, write the tab and its first list in one transaction.
- Rename only: write the name, no `acli` call.
- The store writes an edit only when the tab still has the `jql` that the save read. A tab deleted or changed during the search fails the save with `TabNotFoundError`, and nothing is written.

So a new tab shows tickets with no separate refresh.

Alternative: a separate `testTab` RPC that the dialog calls before `saveTab`. Rejected: two `acli` calls for one save, and the test result can go stale before the save.

### 6. RPC contract

| Method | Change |
|---|---|
| `tickets`, `refresh` | Return the new snapshot. Linked threads are resolved once for the keys of all tabs, then attached to each tab's tickets. |
| `saveTab` | New. Input `{ id?: number, name, jql }`, both trimmed and not empty. Returns the snapshot. |
| `deleteTab` | New. Input `{ id }`. Returns the snapshot. |
| `pickerTickets` | New. Returns `allTickets()`, no linked threads. The thread header uses it, so it does not resolve threads for every tab. |

### 7. Frontend

- `TicketsPage`: header with Refresh and "Add tab". Under it a row of tab buttons (`role="tablist"`), each labeled `Name (count)` or `Name` when `refreshedAt` is null. The selected tab id is local state, and falls back to the first tab when its tab is gone.
- Per tab: the existing health banner, error banner, status groups, and limit note. The limit note says to edit the tab, not the plugin settings.
- Edit and Delete icon buttons at the end of the tab bar act on the selected tab.
- `TabDialog`: name and JQL inputs on the existing `dialog` and `input` components. Save is disabled while a field is empty or a save runs. The dialog cannot close while a save runs. An RPC error shows in the dialog and the dialog stays open.
- Delete confirmation: a small `dialog` with Cancel and Delete. No new shadcn component.
- No tabs: an empty state with "Add tab".
- `ThreadTicket`: the picker reads `pickerTickets`.

## Risks / Trade-offs

- [More `acli` calls: N tabs means N searches each interval] → Sequential calls, and `missing` or `loggedOut` stops the loop early. The user controls N and `refreshMinutes`.
- [A refresh and a save run at the same time] → The refresh writes a result only when the tab still has the `jql` it searched with (decision 4).
- [`tickets` payload grows with N * 200 tickets] → Acceptable for a local plugin. Thread resolution runs once per unique key, not once per tab.
- [**BREAKING** `jql` setting removal: a custom value is lost] → The README says to add the query as a tab.

## Migration Plan

1. Archive `add-jira-plugin`, so `jira-ticket-list` exists as a main spec.
2. Install the new build. Migrations run, the seed makes "My tickets", and the first refresh fills it.
3. Rollback: reinstall the earlier build. Its migrations already ran and it reads the dropped `tickets` table, so delete the plugin database first. Nothing else is lost, because thread links live in thread metadata.
