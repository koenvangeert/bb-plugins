## Why

The Jira page shows one list from one JQL query. I also want lists like "Ready to pick up", "This release", and "Warning" next to my own tickets, and today I must change the `jql` setting each time.

## What Changes

- The Jira page shows tabs. Each tab has a name and a JQL query, and shows the tickets that match it.
- I add, edit, and delete tabs in the Jira page. Save runs the JQL once and shows the error before it saves.
- Each tab shows its ticket count, for example `Warning (3)`.
- The plugin refreshes all tabs on the interval and on Refresh. Each tab keeps its own last good list and error.
- On first start, the plugin makes a "My tickets" tab with the default query. **BREAKING**: the `jql` setting goes away. `bb plugin config jira set jql ...` no longer works, and a custom `jql` value is not copied.
- With no tabs, the page shows an empty state with an "Add tab" control.
- The "Link Jira" picker in the thread header shows tickets from all tabs, with no duplicates.
- Out of scope: tab reorder, alert tabs and sidebar badges, per-tab refresh intervals.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `jira-ticket-list`: the single configurable query becomes a list of user-managed tabs. Refresh and the last good list work per tab.

The `jira-ticket-list` spec comes from the `add-jira-plugin` change, which is not archived yet. Archive `add-jira-plugin` before this change.

## Impact

- `plugins/jira/`: settings, database migrations, ticket service, refresh loop, RPC contract, Jira page, thread header picker, README.
- RPC: `tickets` and `refresh` return tabs. New methods add, edit, delete, and test a tab.
- Database: new `tabs` table. The ticket cache and refresh state are keyed by tab.
- More `acli` calls: one search per tab on each refresh.
