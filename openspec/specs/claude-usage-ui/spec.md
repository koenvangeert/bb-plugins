# claude-usage-ui Specification

## Purpose

Shows Claude Code API spend inside BB: a dashboard page across all projects, a figure on its sidebar row, a figure on each thread, and a setting for how often transcripts are rescanned.

## Requirements

### Requirement: Dashboard page

The plugin SHALL add a sidebar page named `Claude usage`, reachable without selecting a project. The page SHALL show:

- spend today, over 7 days, over 30 days, and over all indexed history
- a 30-day daily bar chart, stacked by input, output, cache write, and cache read, with back and forward buttons that page it one 30-day window at a time through all indexed history
- spend per project, including "Outside BB"
- the top 15 threads by spend
- spend per model, with token volumes

Days SHALL be local days. The page SHALL re-read figures every minute while open.

#### Scenario: Open the page

- **WHEN** the user opens `Claude usage` from the sidebar
- **THEN** the page shows the four totals, the chart, and the project, thread, and model breakdowns

#### Scenario: Page the daily chart

- **WHEN** the chart shows the newest 30 days and older history exists
- **AND** the user clicks the back button
- **THEN** the chart shows the 30 days before that, and the forward button returns to the newest 30 days
- **AND** the forward button is disabled on the newest window and the back button on the oldest

#### Scenario: No transcripts yet

- **WHEN** the index is empty
- **THEN** the page shows zero totals and an empty chart, not an error

### Requirement: Figures are labelled as lower bounds

The page SHALL state that figures are a lower bound on real spend, because transcripts omit some billed usage.

#### Scenario: Lower-bound note

- **WHEN** the dashboard renders
- **THEN** it shows a note that figures may be lower than actual spend

### Requirement: Sidebar row shows today's figure

The `Claude usage` sidebar row SHALL show the spend since local midnight today. Its tooltip SHALL say the figure is for today.

#### Scenario: Sidebar figure

- **WHEN** today's spend is $3.20 and the 30-day spend is $42.10
- **THEN** the sidebar row shows `$3.20`

### Requirement: Thread shows its spend

The thread header SHALL show the open thread's attributed spend, following the attribution rules for no-spend and loading states.

#### Scenario: Thread with spend

- **WHEN** the user opens a thread with $3.20 attributed spend
- **THEN** the thread header shows `$3.20`

### Requirement: Manual rescan

The dashboard SHALL offer a rescan action that starts a scan at once and refreshes the page when it ends.

#### Scenario: Rescan

- **WHEN** the user clicks Rescan transcripts
- **THEN** a scan runs and the page shows the updated figures

### Requirement: Rescan interval setting

The plugin SHALL expose a rescan interval setting in minutes, from 1 to 240, default 5. A value outside the range SHALL be rejected.

#### Scenario: Set interval

- **WHEN** the user runs `bb plugin config claude-usage set rescanMinutes 30`
- **THEN** the background service waits 30 minutes between scans

#### Scenario: Out of range

- **WHEN** the user sets the interval to 0
- **THEN** the setting is rejected and the previous value stays
