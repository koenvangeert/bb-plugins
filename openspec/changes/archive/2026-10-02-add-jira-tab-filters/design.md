## Context

See proposal.md for motivation and `specs/jira-ticket-list/spec.md` for behavior.

Current state in `plugins/jira/`:

- `src/acli.ts` `searchArgs` asks for `key,summary,status,issuetype`. `src/tickets.ts` parses only those fields.
- `src/tabs.ts` stores tabs as `(id, name, jql)`. `isCurrent` compares `id` and `jql`, so a refresh drops a result when the query changed during the search.
- `src/ticketService.ts` runs one search per tab in order. `saveTab` runs the search before it writes.
- `src/database.ts` migrations are append only.
- `components/ui/` has `dialog`, `input`, and `button`. It has no combobox, popover, or checkbox component.

Constraints found by hand against the Jira site (2026-10-02):

- `acli jira workitem search --fields` accepts only `key, summary, status, issuetype, assignee, reporter, creator, priority, labels, description`. `fixVersions`, `components`, `customfield_*`, `*all`, and `*navigable` fail with `field '...' is not allowed`.
- `acli jira workitem view KEY --fields '*all' --json` returns 346 field IDs for one ticket, but `names` and `schema` are `null`. acli has no flag that fills them.
- acli has no command that lists fields, versions, or users. So the plugin cannot get the name or type of a custom field.

## Goals / Non-Goals

**Goals:**

- The JQL builder, the value reader, and the field list are pure code with unit tests.
- A refresh never writes a list under a tab whose JQL or filters changed during that refresh.

**Non-Goals:**

- Local filtering of the cached list to skip the second search.
- `view` calls per ticket to read values of fields that search cannot return.
- Date ranges, text search (`~`), and operators other than `in` and `not in`.

## Decisions

### 1. Filter model

```ts
type FilterValue = { label: string; jql: string } // jql: a JQL literal, or the token EMPTY
type Filter = { field: string; label: string; operator: 'in' | 'not in'; values: FilterValue[] }
```

`field` is the Jira field ID from the field list of decision 5 (`status`, `fixVersions`). `label` is the field name from the field list.

Each value keeps its own JQL literal, because a user shows as a display name but JQL needs the account ID.

### 2. Storage

Appended migrations:

- `ALTER TABLE tabs ADD COLUMN filters TEXT NOT NULL DEFAULT '[]'`: JSON `Filter[]`.
- `ALTER TABLE tab_state ADD COLUMN field_values TEXT NOT NULL DEFAULT '{}'`: JSON `Record<fieldId, FilterValue[]>` from the last good base search.
- `ALTER TABLE tab_state ADD COLUMN values_limit_reached INTEGER NOT NULL DEFAULT 0`.

`isCurrent` compares `jql` and `filters`. Delete already removes the `tabs` row and the `tab_state` row, so filters and values go with it.

Alternative: a `tab_filters` table with one row per filter. Rejected: the plugin always reads and writes the whole list, and order is the array order.

### 3. JQL builder

`effectiveJql(base, filters)`:

1. Split `base` at the first `ORDER BY` outside a quoted string. A small scanner skips `"..."` and `'...'` with backslash escapes.
2. Build one clause per filter, joined with `AND`: `(<base>) AND <c1> AND <c2> <orderBy>`.
3. No filters: return `base` unchanged.

Clause per filter, with `F` the field reference and `L` the non-empty literals:

| Operator | Has "(empty)" | Clause |
|---|---|---|
| `in` | no | `F in (L)` |
| `in` | yes | `(F in (L) OR F is EMPTY)`, or `F is EMPTY` when `L` is empty |
| `not in` | no | `(F not in (L) OR F is EMPTY)` |
| `not in` | yes | `(F not in (L) AND F is not EMPTY)`, or `F is not EMPTY` when `L` is empty |

JQL `not in` drops tickets where the field is empty. The `OR F is EMPTY` keeps them, as the "Not in" scenario requires.

Field reference: each entry in the field list of decision 5 has its JQL name (`fixVersions` to `fixVersion`, `versions` to `affectedVersion`, `components` to `component`, `issuetype` to `type`).

Free-text literals are quoted, with `"` and `\` escaped. The builder never puts user text in JQL without quotes.

### 4. Values from the base search

`searchArgs` asks for `key,summary,status,issuetype,assignee,reporter,creator,priority,labels` on every search. `parseSearch` returns the tickets and, per issue, the raw values of the extra fields.

`fieldValues(issues)` reads these shapes into distinct `FilterValue`s, sorted by label:

| Raw value | label | jql |
|---|---|---|
| `{ accountId, displayName }` | displayName | `"accountId"` |
| `{ name }` | name | `"name"` |
| string (labels item) | itself | `"itself"` |

Each searchable field always offers "(empty)".

Alternative: build values from the filtered list. Rejected: an active filter would hide the values it filtered out (scenario "Values stay when a filter is active").

### 5. Field list

`src/filterFields.ts` exports one fixed list, shared by the server and the UI:

| ID | Name | JQL name | Values |
|---|---|---|---|
| `status` | Status | `status` | dropdown |
| `issuetype` | Type | `type` | dropdown |
| `priority` | Priority | `priority` | dropdown |
| `assignee` | Assignee | `assignee` | dropdown |
| `reporter` | Reporter | `reporter` | dropdown |
| `creator` | Creator | `creator` | dropdown |
| `labels` | Labels | `labels` | dropdown |
| `fixVersions` | Fix versions | `fixVersion` | free text |
| `versions` | Affects versions | `affectedVersion` | free text |
| `components` | Components | `component` | free text |
| `resolution` | Resolution | `resolution` | free text |
| `project` | Project | `project` | free text |
| `parent` | Parent | `parent` | free text |

The RPC rejects a filter whose `field` is not in this list.

Alternative: read field names and types from `view *all`. Rejected: acli returns `names` and `schema` as `null` (Context). Custom fields wait until a source of field names exists.

### 6. Ticket service

Refresh, per tab:

1. Base search with `tab.jql` gives `field_values` and `values_limit_reached`.
2. If the tab has filters: a second search with `effectiveJql` gives the list. Else the base result is the list.
3. Write the list and the values in one transaction, only when `isCurrent` is still true.

When either search fails, write only `error`, so the last good list and the last good values stay. `missing` and `loggedOut` stop the loop as they do now.

`setFilters({ id, filters })`: run the filtered search first. On failure, throw the classified `acli` error and write nothing. On success, write the filters and the list in one transaction. Values do not change, because the base JQL did not change. A removal of all filters skips the second search: it runs the base search once and writes its list and values.

`saveTab` with a changed JQL runs both searches of the refresh and keeps the tab's filters.

### 7. RPC contract

| Method | Change |
|---|---|
| `tickets`, `refresh`, `saveTab`, `deleteTab` | Each tab also returns `filters`, `fieldValues`, and `valuesLimitReached`. |
| `setFilters` | New. Input `{ id, filters }`, validated with zod: a field from the field list, at least one value per filter, operator `in` or `not in`. Returns the snapshot. |

### 8. Frontend

- `FilterBar` above the status groups in `TabPanel`: one chip per filter, `Label: v1, v2` or `Label not: v1`, with an x that removes the filter at once. A "+ Filter" button at the end.
- A chip click or "+ Filter" opens `FilterDialog` on the existing `dialog`:
  - Field: a list of the field names from decision 5.
  - Operator: two toggle buttons, `in` and `not in`.
  - Values: checkboxes from `fieldValues` with "(empty)" for searchable fields. A note shows when `valuesLimitReached`. Other fields: a text input that adds a value on Enter, and an "(empty)" toggle.
  - Apply is disabled with no field or no value. An RPC error shows in the dialog and the dialog stays open, as in `TabDialog`.
- Native `<input type="checkbox">` and buttons. No new shadcn component.

## Risks / Trade-offs

- [No custom fields] → Out of scope for now. A later change can add them when a source of field names exists.
- [2 searches per filtered tab per refresh] → Sequential, as now. The user controls the number of filtered tabs and `refreshMinutes`.
- [Dropdown values come only from the first 200 base tickets] → The dropdown says so (decision 8).
- [Free-text typos] → Apply runs the query and shows the `acli` error before it saves (spec "Apply filters checks the query").

## Migration Plan

1. Install the new build. Migrations add the columns with defaults, so every tab starts with no filters and works as before.
2. Rollback: reinstall the earlier build. It ignores the new columns. Filters are lost only if the database is deleted.
