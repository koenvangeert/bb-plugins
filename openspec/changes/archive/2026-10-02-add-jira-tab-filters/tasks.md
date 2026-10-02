# Tasks

## 1. Preconditions

- [x] 1.1 Run `acli jira workitem view <key> --fields '*all' --json` on a real ticket and verify that `names` and `schema` have content (result: both `null`, so design.md decision 5 is now a fixed list of system fields)

## 2. JQL builder

- [x] 2.1 Add `effectiveJql(base, filters)` with the `ORDER BY` scanner, and verify unit tests: no filters returns `base` unchanged, `ORDER BY` is kept at the end, `order by` inside a quoted string is not split, lowercase `order by` is split
- [x] 2.2 Add the field list of design.md decision 5 in `src/filterFields.ts`, the clause rules for `in` and `not in` with and without "(empty)", and literal quoting, and verify unit tests for every row of the design.md decision 3 table, the JQL names of the field list, and a value with `"` and `\`

## 3. acli and values

- [x] 3.1 Extend `searchArgs` with `assignee,reporter,creator,priority,labels` and `parseSearch` to return the raw values of those fields, and verify `acli.test.ts` and `tickets.test.ts` with an updated `search.json` fixture
- [x] 3.2 Add `fieldValues(issues)` for user, `{ name }`, and string values, with "(empty)" per field and sorting by label, and verify unit tests: a user gives its display name as label and its account ID as literal, duplicates collapse, a null field adds no value

## 4. Storage

- [x] 4.1 Append the migrations for `tabs.filters`, `tab_state.field_values`, and `tab_state.values_limit_reached` to `src/database.ts`, and verify a test that runs all migrations on a fresh database and on a database with the current schema
- [x] 4.2 Extend the tab store: read and write `filters`, write `field_values` with the list, include `filters` in `isCurrent`, and verify `tabs.test.ts`: filters survive a reread, a list for a tab whose filters changed is dropped, delete removes filters and values

## 5. Ticket service

- [x] 5.1 Change refresh to run the base search and, for a tab with filters, the filtered search, and verify `ticketService.test.ts`: a filtered tab makes 2 `acli` calls with the expected JQL, a tab without filters makes 1, values come from the base result, a failed filtered search keeps the last good list and values
- [x] 5.2 Add `setFilters`, and verify tests: a failing filtered query writes nothing and throws the `acli` text, a valid one writes filters and list, removing all filters runs only the base search
- [x] 5.3 Keep filters in `saveTab` when the JQL changes, and verify a test that the new list matches the new JQL and the kept filters

## 6. RPC

- [x] 6.1 Update `src/rpc.ts`: tab output gains `filters`, `fieldValues`, `valuesLimitReached`, and the new `setFilters` method, and verify `rpc.test.ts`: a filter with no values, an unknown operator, or a field outside the field list is rejected, and `setFilters` returns the snapshot

## 7. Frontend

- [x] 7.1 Add `FilterBar` with chips and "+ Filter" to `TabPanel`, and verify `app.test.tsx`: chips show `Label: v1, v2` and `Label not: v1`, the x calls `setFilters` without that filter, the tab label count is the filtered count
- [x] 7.2 Add `FilterDialog` with the field list, operator toggle, value checkboxes for dropdown fields, free-text values for other fields, and the 200-ticket note, and verify `app.test.tsx`: Apply is disabled with no value, an RPC error shows in the open dialog, editing a chip opens the dialog with its values checked
- [x] 7.3 Update `README.md` and `PLUGIN_OVERVIEW.md` with tab filters, the dropdown fields, the free-text fields, and the extra `acli` calls, and verify the docs name the same searchable fields as `searchArgs`

## 8. Integration

- [x] 8.1 Run `npm test`, `npm run typecheck`, and `npm run build` in `plugins/jira/`, and verify all pass
- [x] 8.2 Install with `bb plugin install ./plugins/jira` and verify by hand on "Ready to pick up": a Status filter with two values, an Assignee `not in` filter keeps unassigned tickets, a Fix version free-text filter, a typo shows the `acli` error, filters stay after a reload, and a tab JQL with `ORDER BY` keeps its order
