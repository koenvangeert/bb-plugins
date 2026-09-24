## Purpose

Gives other bb plugins a small, versioned PR summary per thread, so that they can show PR insight without calling GitHub themselves.

## ADDED Requirements

### Requirement: Summary in thread plugin metadata
The plugin SHALL write a PR summary to the thread's plugin metadata, in namespace `github-insight`, under key `prSummary`. It SHALL update the summary after each refresh that changes the data. It SHALL remove the key when the thread has no PR.

#### Scenario: Summary after a refresh
- **WHEN** a refresh of a thread's PR finishes with new data
- **THEN** the thread's plugin metadata `github-insight.prSummary` contains the new summary

#### Scenario: PR unlinked
- **WHEN** bb no longer links a PR to the thread
- **THEN** the plugin removes `github-insight.prSummary` from the thread's plugin metadata

### Requirement: Summary shape version 1
The summary SHALL be a JSON object with these fields:
- `version`: the number `1`
- `updatedAt`: ISO 8601 time of the last good refresh
- `pr`: `{ number, url, state }`, where `state` is `open`, `draft`, `merged`, or `closed`
- `checks`: `{ failed, running, cancelled, passed, skipped }` counts, and `failedNames`: up to 5 names of failed checks
- `reviewers`: `{ pending, approved, changesRequested }` counts, and `pendingNames`: up to 5 names of pending reviewers (teams with a "(team)" suffix)
- `blockers`: the list of blocker codes, most important first
- `error`: `null`, or a short error text when the last refresh failed
The summary SHALL be smaller than 4 KiB. It SHALL NOT contain annotation text, check reasons, tokens, or other secrets.

#### Scenario: Summary for PR 25392
- **WHEN** PR 25392 has 1 failed check, 50 passed checks, and team `ai-governance` pending as code owner
- **THEN** the summary has `checks.failed` 1, `checks.passed` 50, `reviewers.pending` 1, `reviewers.pendingNames` `["ai-governance (team)"]`, and `blockers` that start with `checks_failed`

#### Scenario: Last refresh failed
- **WHEN** the last refresh failed with "rate limited"
- **THEN** the summary keeps the data and `updatedAt` of the last good refresh
- **AND** `error` is "rate limited"

### Requirement: Compatible changes to the summary
The plugin SHALL only add optional fields to a version 1 summary. Any change that removes, renames, or changes the meaning of a field SHALL use a new `version` number.

#### Scenario: New optional field
- **WHEN** a later release adds an optional field to the summary
- **THEN** `version` stays `1`
