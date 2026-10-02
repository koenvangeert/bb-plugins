# jira-ticket-list Specification

## Purpose
Shows Jira tickets inside BB in tabs, one per JQL query that the user manages, read through the user's Atlassian CLI login, so the user can see their work and the threads on it in one place.

## Requirements

### Requirement: Read tickets through acli
The plugin SHALL read Jira tickets only through the `acli` command on the BB server host. The plugin SHALL NOT store Jira credentials.

#### Scenario: Tickets come from the acli login
- **WHEN** `acli` is on `PATH` and logged in
- **THEN** the plugin reads tickets with the account that `acli` is logged in to

### Requirement: Ticket fields
For each ticket the plugin SHALL keep the key, summary, status, issue type, and Jira browse URL.

#### Scenario: Ticket row content
- **WHEN** the query returns ticket `ABC-12` with summary "Fix login" and status "In Progress"
- **THEN** the sidebar page shows a row with `ABC-12`, "Fix login", "In Progress", and a link that opens `ABC-12` in Jira

### Requirement: Periodic refresh
The plugin SHALL refresh every tab when it starts and then on an interval from the `refreshMinutes` setting (1 to 240, default 5).

#### Scenario: Interval refresh
- **WHEN** `refreshMinutes` is 5 and 5 minutes pass after the last refresh
- **THEN** the plugin reads the tickets of every tab again and the sidebar page shows the new lists

#### Scenario: Out-of-range interval
- **WHEN** the user sets `refreshMinutes` to 0 or 241
- **THEN** the setting is rejected

### Requirement: Manual refresh
The sidebar page SHALL have a Refresh control that reads the tickets of every tab now.

#### Scenario: Refresh now
- **WHEN** the user clicks Refresh
- **THEN** the plugin reads the tickets of every tab and the page shows the new lists and the refresh time

### Requirement: Last good list on failure
When the refresh of a tab fails, the plugin SHALL keep showing the last good list of that tab and SHALL show the error and the time of its last good refresh. A failure in one tab SHALL NOT change the other tabs.

#### Scenario: Network failure
- **WHEN** a refresh fails after an earlier refresh succeeded
- **THEN** each tab shows its earlier list, the error text, and the time of its earlier refresh

#### Scenario: One bad query
- **WHEN** the query of the "Warning" tab fails and the query of the "My tickets" tab runs
- **THEN** "My tickets" shows its new list and "Warning" shows its earlier list and the error

### Requirement: acli health state
The plugin SHALL detect when `acli` is not on `PATH` or not logged in, and SHALL tell the user the command that fixes it.

#### Scenario: acli missing
- **WHEN** `acli` is not on `PATH` on the BB server host
- **THEN** the sidebar page and the plugin status say that `acli` is not installed and link to its install page

#### Scenario: acli logged out
- **WHEN** `acli` reports that no Jira account is logged in
- **THEN** the sidebar page and the plugin status say to run `acli jira auth login`

#### Scenario: Recovery
- **WHEN** the user logs in with `acli` and the next refresh succeeds
- **THEN** the sidebar page message goes away and the list shows

#### Scenario: Plugin status after recovery
- **WHEN** the user has logged in with `acli` after the plugin status was set
- **THEN** the plugin status clears after `bb plugin reload jira`, because BB clears that status only on reload

### Requirement: Linked threads per ticket
Each ticket row SHALL show the BB threads linked to that ticket and SHALL open a thread when the user clicks it.

#### Scenario: Ticket with linked threads
- **WHEN** two threads are linked to `ABC-12`
- **THEN** the `ABC-12` row shows both threads by title, and clicking one opens it

#### Scenario: Ticket with no threads
- **WHEN** no thread is linked to `ABC-40`
- **THEN** the `ABC-40` row shows a "Start thread" control and no thread list

### Requirement: Ticket tabs
The Jira page SHALL show one tab per saved ticket query. Each tab SHALL have a name and a JQL query, and SHALL show only the tickets that match its query.

#### Scenario: Two tabs
- **WHEN** the user has a tab "My tickets" with `assignee = currentUser()` and a tab "Ready to pick up" with `status = "Ready for Dev"`
- **THEN** the page shows both tabs, and selecting "Ready to pick up" shows only the tickets that match `status = "Ready for Dev"`

### Requirement: Add a tab
The Jira page SHALL have an "Add tab" control that asks for a name and a JQL query. Before it saves, the plugin SHALL run the query once through `acli`. The plugin SHALL save the tab only when the query runs without error.

#### Scenario: Valid query
- **WHEN** the user adds a tab "This release" with `fixVersion in unreleasedVersions()` and the query runs
- **THEN** the plugin saves the tab, the page shows it, and its tickets show without a separate refresh

#### Scenario: Invalid query
- **WHEN** the user adds a tab with the query `status = = Done`
- **THEN** the dialog shows the `acli` error text and the plugin does not save the tab

#### Scenario: Empty name or query
- **WHEN** the user leaves the name or the query empty
- **THEN** the dialog does not let the user save

### Requirement: Edit a tab
The user SHALL be able to change the name and the JQL query of a tab. A changed query SHALL pass the same test run as a new tab before the plugin saves it.

#### Scenario: Rename a tab
- **WHEN** the user renames "Warning" to "Overdue" and keeps the query
- **THEN** the tab shows the name "Overdue" and the same tickets

#### Scenario: Change the query
- **WHEN** the user changes the query of a tab and the new query runs
- **THEN** the tab shows the tickets that match the new query

### Requirement: Delete a tab
The user SHALL be able to delete a tab after a confirmation. Deleting a tab SHALL NOT change thread links.

#### Scenario: Delete a tab
- **WHEN** the user deletes the "Warning" tab and confirms
- **THEN** the page no longer shows the "Warning" tab, and threads linked to its tickets stay linked

#### Scenario: No tabs left
- **WHEN** the user deletes the last tab
- **THEN** the page shows an empty state with an "Add tab" control

### Requirement: Ticket count per tab
Each tab SHALL show the number of tickets in its last good list.

#### Scenario: Count in the tab label
- **WHEN** the last good list of the "Warning" tab has 3 tickets
- **THEN** the tab label shows `Warning (3)`

#### Scenario: Tab not read yet
- **WHEN** a tab has no good list yet
- **THEN** the tab label shows the name with no count

### Requirement: First tab on first start
On the first start after this change, the plugin SHALL make one tab named "My tickets" with the query `assignee = currentUser() AND statusCategory != Done`. The plugin SHALL do this only once.

#### Scenario: Upgrade
- **WHEN** the plugin starts for the first time after the upgrade
- **THEN** the page has one tab "My tickets" with `assignee = currentUser() AND statusCategory != Done`

#### Scenario: Deleted tabs stay deleted
- **WHEN** the user deletes all tabs and the plugin restarts
- **THEN** the page has no tabs

### Requirement: Ticket limit per tab
Each tab SHALL keep at most 200 tickets. When a query matches more, the tab SHALL say that it shows only the first 200.

#### Scenario: Limit reached
- **WHEN** the query of a tab matches 250 tickets
- **THEN** the tab shows 200 tickets and a note that tells the user to narrow the query

### Requirement: Link picker shows tickets from all tabs
The "Link Jira" picker in the thread header SHALL list the tickets from the last good lists of all tabs, each ticket once.

#### Scenario: Ticket in two tabs
- **WHEN** `ABC-12` is in the "My tickets" tab and in the "This release" tab
- **THEN** the picker lists `ABC-12` once
