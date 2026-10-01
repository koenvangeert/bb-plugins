## Purpose

Lets a user see and filter subtasks in the task list view, nested under their parent task, without opening each parent.

## ADDED Requirements

### Requirement: Subtasks nest under their parent
The list view SHALL show each subtask as an indented row directly below its parent row. A subtask SHALL stay in the status group of its parent, whatever its own status. A subtask row SHALL show its own status, key, title, and the same metadata and edit menus as a top-level row. A click on a subtask row SHALL open that subtask.

#### Scenario: Subtask with a different status
- **WHEN** ABC-1 has status `in_progress`, its subtask ABC-2 has status `done`, and ABC-1 is expanded
- **THEN** ABC-2 shows below ABC-1 in the "In Progress" group with a `done` status icon
- **AND** the "Done" group does not show ABC-2

#### Scenario: Open a subtask
- **WHEN** a user clicks the ABC-2 row
- **THEN** the detail view of ABC-2 opens

### Requirement: Subtask order
Subtasks under one parent SHALL use the same sort as the list.

#### Scenario: Sort by priority
- **WHEN** the list sort is priority and ABC-1 has subtasks ABC-2 (`low`) and ABC-3 (`urgent`)
- **THEN** ABC-3 shows above ABC-2

### Requirement: Parent done count
A row for a task with one or more subtasks SHALL show "D/T", where T is the number of subtasks and D is the number with status `done`. The count SHALL include all subtasks, also subtasks that a filter hides.

#### Scenario: Count
- **WHEN** ABC-1 has three subtasks and one has status `done`
- **THEN** the ABC-1 row shows "1/3"

#### Scenario: Count with a filter
- **WHEN** ABC-1 has three subtasks, one has status `done`, and a filter hides two of them
- **THEN** the ABC-1 row still shows "1/3"

### Requirement: Expand and collapse
A parent row with one or more visible subtasks SHALL show a chevron. A click on the chevron SHALL show or hide its subtasks and SHALL NOT open the task. A parent with no visible subtasks SHALL NOT show a chevron.

#### Scenario: Expand
- **WHEN** ABC-1 is collapsed and a user clicks its chevron
- **THEN** the subtasks of ABC-1 show below it
- **AND** the detail view does not open

#### Scenario: Task without subtasks
- **WHEN** ABC-4 has no subtasks
- **THEN** the ABC-4 row shows no chevron and no done count

### Requirement: Collapsed by default and saved toggles
With no active filter, a parent SHALL be collapsed until a user expands it. The list SHALL save each expand and collapse toggle per task on the device and SHALL use it after a reload.

#### Scenario: First view
- **WHEN** a user opens the list for the first time and no filter is active
- **THEN** all parents are collapsed

#### Scenario: Toggle survives reload
- **WHEN** a user expands ABC-1 and reloads the panel
- **THEN** ABC-1 is expanded

### Requirement: Filters match parents and subtasks
With an active filter (status, priority, label, Ready or Blocked, or the active-work view), the list SHALL show a task when it matches. When a subtask matches, the list SHALL also show its parent. A parent that does not match SHALL show dimmed. A subtask that does not match SHALL NOT show. A parent with a matching subtask SHALL show expanded.

#### Scenario: Only the subtask matches
- **WHEN** the filter is Blocked, ABC-1 is ready, and its subtask ABC-3 is blocked
- **THEN** ABC-1 shows dimmed and expanded
- **AND** ABC-3 shows below ABC-1

#### Scenario: Only the parent matches
- **WHEN** the filter is status `todo`, ABC-1 has status `todo`, and its subtasks have status `done`
- **THEN** ABC-1 shows at full strength with no visible subtasks and no chevron

#### Scenario: Neither matches
- **WHEN** neither ABC-1 nor any of its subtasks match the filter
- **THEN** ABC-1 and its subtasks do not show

### Requirement: Counts in the list
A status group header SHALL count the parent rows in that group, dimmed parents included. The task count in the filter bar SHALL count the tasks that match, parents and subtasks, and SHALL NOT count dimmed parents.

#### Scenario: Header and filter bar counts
- **WHEN** the filter is Blocked and the only match is subtask ABC-3 of ready parent ABC-1 (`todo`)
- **THEN** the "Todo" header shows 1
- **AND** the filter bar shows 1 task
