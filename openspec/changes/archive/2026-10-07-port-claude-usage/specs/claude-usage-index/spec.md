## Purpose

Reads the Claude Code transcripts on the BB server host and keeps a durable record of the tokens each billed response used, so spend history survives after Claude Code prunes its transcripts.

## ADDED Requirements

### Requirement: Transcripts are discovered under the Claude config directory

The plugin SHALL read every `*.jsonl` transcript under `<config>/projects/`, including nested `<session>/subagents/*.jsonl` files. `<config>` SHALL be `CLAUDE_CONFIG_DIR` when it is set and not blank, and `~/.claude` otherwise.

#### Scenario: Default location

- **WHEN** `CLAUDE_CONFIG_DIR` is not set
- **THEN** the plugin reads transcripts under `~/.claude/projects/`

#### Scenario: Relocated install

- **WHEN** `CLAUDE_CONFIG_DIR` is set to `/opt/claude`
- **THEN** the plugin reads transcripts under `/opt/claude/projects/`

#### Scenario: Subagent transcripts

- **WHEN** a session has subagent transcripts under `<session>/subagents/`
- **THEN** their billed responses are indexed with the parent session's

### Requirement: One billed response is counted once

Records SHALL be collapsed by `message.id`. The last record for a `message.id` SHALL be kept, because earlier records of a streamed response carry partial output counts. A record with no usage, no message id, no model, no timestamp, or no cwd SHALL be ignored. A response with zero tokens in every class SHALL be ignored.

#### Scenario: Response written once per content block

- **WHEN** a transcript holds three records with the same `message.id`
- **THEN** the index counts that response once

#### Scenario: Streamed response

- **WHEN** the first record for a `message.id` has 10 output tokens and the last has 400
- **THEN** the index records 400 output tokens

#### Scenario: Malformed line

- **WHEN** a transcript line is not valid JSON
- **THEN** the line is skipped and the rest of the file is indexed

### Requirement: Cache writes keep their duration

The index SHALL record five-minute and one-hour cache writes separately. When a record has no five-minute/one-hour split, all cache-write tokens SHALL count as five-minute writes.

#### Scenario: Split present

- **WHEN** a usage record has `cache_creation.ephemeral_1h_input_tokens: 100`
- **THEN** the index records 100 one-hour cache-write tokens

#### Scenario: Split absent

- **WHEN** a usage record has only `cache_creation_input_tokens: 100`
- **THEN** the index records 100 five-minute cache-write tokens

### Requirement: Only changed transcripts are re-read

A scan SHALL re-read a transcript only when its size or modification time differs from the last indexed values.

#### Scenario: Unchanged file

- **WHEN** a transcript's size and modification time match the index
- **THEN** the scan does not read it

#### Scenario: Appended file

- **WHEN** a transcript grew since the last scan
- **THEN** the scan re-reads it and replaces that transcript's rows

### Requirement: The index only grows

Rows SHALL be stored per transcript. Re-reading a transcript SHALL replace that transcript's rows and no others. Rows of a deleted transcript SHALL be kept. A manual rescan SHALL merge into the index and SHALL NOT rebuild it from scratch. Rows SHALL hold token counts, not dollars.

#### Scenario: Claude Code prunes a transcript

- **WHEN** a transcript that was indexed no longer exists
- **THEN** its spend still appears in every figure

#### Scenario: Manual rescan

- **WHEN** the user starts a rescan
- **THEN** spend from deleted transcripts is still present afterwards

### Requirement: Rows are bucketed by UTC hour and working directory

Rows SHALL be keyed by UTC hour, model, and the working directory Claude Code recorded. Presentation SHALL convert hours to local days.

#### Scenario: Timezone change

- **WHEN** the server timezone changes after indexing
- **THEN** stored rows are unchanged and daily figures follow the new timezone

### Requirement: Scans run in the background on an interval

A background service SHALL scan once at start and then once per rescan interval. The interval SHALL be read before each wait, so a change applies after the current wait ends without a reload. The service SHALL stop when BB disables, reloads, or shuts down the plugin.

#### Scenario: Interval changed

- **WHEN** the user changes the rescan interval from 5 to 30 minutes
- **THEN** the scan after the next one waits 30 minutes

#### Scenario: Plugin disabled mid-scan

- **WHEN** the plugin is disabled during a scan
- **THEN** the scan stops and no partial index is written
