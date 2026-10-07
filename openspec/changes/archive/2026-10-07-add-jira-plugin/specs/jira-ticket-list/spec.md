# Spec Delta

## Purpose

Shows the Jira tickets assigned to the user inside BB, read through the user's Atlassian CLI login, so the user can see their work and the threads on it in one place.

## ADDED Requirements

### Requirement: Read tickets through acli
The plugin SHALL read Jira tickets only through the `acli` command on the BB server host. The plugin SHALL NOT store Jira credentials.

#### Scenario: Tickets come from the acli login
- **WHEN** `acli` is on `PATH` and logged in
- **THEN** the plugin reads tickets with the account that `acli` is logged in to

### Requirement: Configurable ticket query
The plugin SHALL select tickets with a JQL query from the `jql` setting. The default SHALL be `assignee = currentUser() AND statusCategory != Done`.

#### Scenario: Default query
- **WHEN** the user has not changed the `jql` setting
- **THEN** the list shows tickets assigned to the user that are not in a Done status category

#### Scenario: Custom query
- **WHEN** the user sets `jql` to `project = ABC AND assignee = currentUser()`
- **THEN** the next refresh shows only tickets that match that query

### Requirement: Ticket fields
For each ticket the plugin SHALL keep the key, summary, status, issue type, and Jira browse URL.

#### Scenario: Ticket row content
- **WHEN** the query returns ticket `ABC-12` with summary "Fix login" and status "In Progress"
- **THEN** the sidebar page shows a row with `ABC-12`, "Fix login", "In Progress", and a link that opens `ABC-12` in Jira

### Requirement: Periodic refresh
The plugin SHALL refresh the ticket list when it starts and then on an interval from the `refreshMinutes` setting (1 to 240, default 5).

#### Scenario: Interval refresh
- **WHEN** `refreshMinutes` is 5 and 5 minutes pass after the last refresh
- **THEN** the plugin reads the tickets again and the sidebar page shows the new list

#### Scenario: Out-of-range interval
- **WHEN** the user sets `refreshMinutes` to 0 or 241
- **THEN** the setting is rejected

### Requirement: Manual refresh
The sidebar page SHALL have a Refresh control that reads the tickets now.

#### Scenario: Refresh now
- **WHEN** the user clicks Refresh
- **THEN** the plugin reads the tickets and the page shows the new list and the refresh time

### Requirement: Last good list on failure
When a refresh fails, the plugin SHALL keep showing the last good list and SHALL show the error and the time of the last good refresh.

#### Scenario: Network failure
- **WHEN** a refresh fails after an earlier refresh succeeded
- **THEN** the page shows the earlier list, the error text, and the time of the earlier refresh

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
