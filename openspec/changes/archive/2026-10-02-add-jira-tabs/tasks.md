# Tasks

## 1. Preconditions

- [x] 1.1 Archive `add-jira-plugin` and verify `openspec list --specs` shows `jira-ticket-list`
- [x] 1.2 Decide the seed source and record it in design.md decision 3 (decided: `DEFAULT_JQL`)

## 2. Storage and seed

- [x] 2.1 Append the `DROP TABLE tickets`, `tab_tickets`, `tab_state`, and `tab_seed` migrations to `src/database.ts`, and verify a test that runs all migrations on a fresh database and on a database with the old schema
- [x] 2.2 Add a tab store (list, insert, rename, change query, delete with its `tab_tickets` and `tab_state` rows) and verify its unit tests, including that delete leaves `thread_links` unchanged
- [x] 2.3 Add the one-time "My tickets" seed with `DEFAULT_JQL`, remove `jql` from `SETTINGS`, and verify tests: seed runs once, a deleted tab set stays empty after a second start, and `settings.test.ts` no longer expects `jql`

## 3. Ticket service

- [x] 3.1 Change `refresh()` to search each tab in order and write per-tab lists and errors, and verify `ticketService.test.ts` cases: two tabs, one bad query keeps the other tab's new list, a failed tab keeps its last good list, and the 200 limit per tab
- [x] 3.2 Stop the loop on `missing` or `loggedOut` and keep the global health, and verify a test that a logged-out first tab makes no further `acli` calls
- [x] 3.3 Drop a result when its tab was deleted or its `jql` changed during the refresh, and verify a test with a fake runner that edits the tab before the search resolves
- [x] 3.4 Add `saveTab` (search first on new or changed query, rename without `acli`) and `allTickets()` (unique keys in tab order), and verify tests: invalid query saves nothing, valid query saves the tab and its first list, rename makes no `acli` call
- [x] 3.5 Switch `threadLinks` to `allTickets()` and verify `threadLinks.test.ts` finds a ticket that is only in a second tab

## 4. RPC

- [x] 4.1 Update `src/rpc.ts`: new snapshot shape for `tickets` and `refresh`, and new `saveTab`, `deleteTab`, and `pickerTickets`, and verify `rpc.test.ts` covers each method and that linked threads resolve once per unique key

## 5. Frontend

- [x] 5.1 Add the tab bar to `TicketsPage` with `Name (count)` labels, per-tab banners and limit note, and the no-tabs empty state, and verify `app.test.tsx` cases for counts, tab switch, and empty state
- [x] 5.2 Add `TabDialog` for add and edit, and the delete confirmation, and verify `app.test.tsx` cases: Save disabled on empty fields, an RPC error shows in the open dialog, delete removes the tab
- [x] 5.3 Switch the `ThreadTicket` picker to `pickerTickets` and verify the existing picker tests pass with tickets from two tabs

## 6. Docs

- [x] 6.1 Update `README.md` and `PLUGIN_OVERVIEW.md`: tabs, the removed `jql` setting, and how to edit the "My tickets" tab, and verify no doc still mentions `bb plugin config jira set jql`

## 7. Integration

- [x] 7.1 Run `npm test`, `npm run typecheck`, and `npm run build` in `plugins/jira/`, and verify all pass
- [x] 7.2 Install with `bb plugin install ./plugins/jira` and verify by hand: "My tickets" holds the default query, add "Ready to pick up" and "This release" tabs, an invalid query shows its error, counts show, delete works, and the "Link Jira" picker lists tickets from all tabs
