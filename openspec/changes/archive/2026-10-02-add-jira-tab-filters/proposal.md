## Why

A tab like "Ready to pick up" shows 122 tickets. To narrow it by status, fix version, or assignee, I must edit the tab JQL each time and remove the change after. I want filters on fields that I can add and remove per tab.

## What Changes

- Each tab has a filter bar above its list. A filter is one field, an operator (`in` or `not in`), and one or more values.
- The plugin adds the filters to the tab JQL as `AND` clauses and runs the search through `acli`. A tab JQL with `ORDER BY` keeps its sort order.
- "+ Filter" opens a picker with a fixed list of Jira system fields, by name. acli returns no field names, so custom fields are out of scope for now.
- Values for status, type, priority, assignee, reporter, creator, and labels come from a dropdown of the values in the tab's results. `acli` search returns only these fields.
- Values for the other system fields (fix versions, affects versions, components, resolution, project, parent) are free text, because `acli` search cannot return them.
- An "(empty)" value matches tickets where the field has no value.
- The plugin saves the filters of each tab. They stay after a reload and a restart.
- Apply runs the filtered query once. On an error, the dialog shows the `acli` error text and the plugin keeps the old filters.
- A tab with filters makes 2 searches on each refresh: the tab JQL for the dropdown values, and the filtered JQL for the list.
- Out of scope: custom fields (for example Sprint), filters on date fields and text fields (`~`), saved filter presets shared across tabs, and local filtering without an `acli` call.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `jira-ticket-list`: tabs get saved field filters. The list of a tab shows the tickets that match the tab JQL and its filters.

## Impact

- `plugins/jira/`: database migrations, tab store, ticket service, `acli` arguments and parser, RPC contract, Jira page, README, and PLUGIN_OVERVIEW.
- RPC: each tab returns its filters and its dropdown values. A new method sets the filters of a tab.
- Database: a filters column on `tabs`, and dropdown values columns on `tab_state`.
- More `acli` calls: a tab with filters makes 2 searches for each refresh.
