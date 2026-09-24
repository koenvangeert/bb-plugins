## Purpose

Makes the forked dockside sidebar show PR insight from the `github-insight` summary, and keeps the current dockside behavior when that summary is not there.

## ADDED Requirements

### Requirement: Read the summary when it is valid
Dockside SHALL read `github-insight.prSummary` from a thread's plugin metadata. It SHALL use the summary only when it is an object with `version` equal to `1`, fields of the expected types, and an `updatedAt` that is not more than 1 hour ago. In all other cases it SHALL ignore the summary and show the row as it does without `github-insight`.

#### Scenario: Valid summary
- **WHEN** a thread has a valid version 1 summary
- **THEN** dockside shows the PR insight on that thread's row

#### Scenario: Plugin not installed
- **WHEN** a thread has no `github-insight.prSummary`
- **THEN** dockside shows the row with the core PR data, as before

#### Scenario: Old summary
- **WHEN** a thread has a valid summary with `updatedAt` more than 1 hour ago
- **THEN** dockside ignores it and shows the row with the core PR data

#### Scenario: Unknown version
- **WHEN** a thread has a summary with `version` equal to `2`
- **THEN** dockside ignores it and shows the row with the core PR data

### Requirement: PR insight on the sidebar row
When the summary is valid and the PR is open or draft, the row SHALL show next to the PR number: the count of failed checks when it is more than zero, the count of running checks when it is more than zero, and the count of pending reviewers when it is more than zero. A tooltip SHALL list the failed check names, the pending reviewer names, and the blocker texts. When the summary has an `error`, the row SHALL show the data with a stale mark.

#### Scenario: Failed checks and pending reviewer
- **WHEN** the summary has 2 failed checks and 1 pending reviewer `ai-governance (team)`
- **THEN** the row shows a failed count of 2 and a pending review count of 1
- **AND** the tooltip lists the 2 failed check names and "ai-governance (team)"

#### Scenario: Merged PR
- **WHEN** the summary has PR state `merged`
- **THEN** the row shows the PR as merged, without check or review counts

### Requirement: Click on the row
A click on the PR insight on the row SHALL open the thread.

#### Scenario: Click
- **WHEN** the user clicks the PR insight on a row
- **THEN** bb opens that thread
