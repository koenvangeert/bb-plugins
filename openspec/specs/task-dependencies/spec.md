# task-dependencies Specification

## Purpose

Lets a task declare which other tasks must finish first, so users and agents can see which work is ready to start and which work waits on other work.

## Requirements

### Requirement: Blocker links
The system SHALL let a user or agent link two tasks as "blocker blocks blocked". A task SHALL have zero or more blockers and SHALL block zero or more tasks. Links SHALL be allowed between tasks in different tracker projects.

#### Scenario: Add a link
- **WHEN** a user adds ABC-3 as a blocker of ABC-5
- **THEN** ABC-5 lists ABC-3 under "Blocked by"
- **AND** ABC-3 lists ABC-5 under "Blocks"

#### Scenario: Link across projects
- **WHEN** a user adds XYZ-1 as a blocker of ABC-5
- **THEN** the link is saved

#### Scenario: Remove a link
- **WHEN** a user removes ABC-3 as a blocker of ABC-5
- **THEN** neither task lists the other

#### Scenario: Add a link that exists
- **WHEN** a user adds ABC-3 as a blocker of ABC-5 and that link exists
- **THEN** the system keeps one link and reports no error

### Requirement: Invalid links are rejected
The system MUST reject a link from a task to itself. The system MUST reject a link that makes a cycle. The error SHALL name the tasks in the cycle.

#### Scenario: Self-link
- **WHEN** a user adds ABC-5 as a blocker of ABC-5
- **THEN** the system rejects it and saves nothing

#### Scenario: Cycle
- **WHEN** ABC-3 blocks ABC-4, ABC-4 blocks ABC-5, and a user adds ABC-5 as a blocker of ABC-3
- **THEN** the system rejects it with an error that names ABC-3, ABC-4, and ABC-5

### Requirement: Blocked and ready state
A task SHALL be **blocked** when one or more of its blockers has a status other than `done` or `canceled`. Otherwise it SHALL be **ready**. The state SHALL follow the current status of the blockers with no manual step. Subtasks SHALL NOT change the state of their parent.

#### Scenario: Open blocker
- **WHEN** ABC-3 has status `todo` and blocks ABC-5
- **THEN** ABC-5 is blocked

#### Scenario: All blockers resolved
- **WHEN** the blockers of ABC-5 are ABC-3 with status `done` and ABC-4 with status `canceled`
- **THEN** ABC-5 is ready

#### Scenario: Blocker reopened
- **WHEN** ABC-3 goes from `done` back to `todo` and ABC-3 blocks ABC-5
- **THEN** ABC-5 is blocked again

#### Scenario: Open subtask
- **WHEN** ABC-1 has an open subtask ABC-2 and no blockers
- **THEN** ABC-1 is ready

#### Scenario: Blocker deleted
- **WHEN** ABC-3 blocks ABC-5 and ABC-3 is deleted
- **THEN** the link is removed and ABC-3 no longer affects the state of ABC-5

### Requirement: Badges on list rows and board cards
A list row and a board card SHALL show "Blocked by N" when the task is blocked, where N is the number of open blockers. They SHALL show "Blocks N" when the task has N or more blocked tasks that are not `done` or `canceled`. A task with neither SHALL show no dependency badge.

#### Scenario: Blocked task
- **WHEN** ABC-5 has 2 open blockers
- **THEN** its row and card show "Blocked by 2"

#### Scenario: Blocking task
- **WHEN** ABC-3 blocks 3 open tasks and has no open blockers
- **THEN** its row and card show "Blocks 3"

#### Scenario: Badge updates
- **WHEN** a blocker of ABC-5 goes to `done`
- **THEN** the badge of ABC-5 updates without a manual refresh

### Requirement: Ready and Blocked filter
The list and board filter bar SHALL have a dependency filter with the values All, Ready, and Blocked. All SHALL be the default.

#### Scenario: Show only ready work
- **WHEN** a user selects Ready
- **THEN** only ready tasks show

#### Scenario: Show only blocked work
- **WHEN** a user selects Blocked
- **THEN** only blocked tasks show

### Requirement: Dependency sections in the detail view
The task detail view SHALL show a "Blocked by" section and a "Blocks" section. Each entry SHALL show the task key, title, and status, and SHALL open that task on click. A user SHALL be able to add a blocker, add a blocked task, and remove a link from these sections. A rejected link SHALL show the error and SHALL NOT change the sections.

#### Scenario: Add a blocker from the detail view
- **WHEN** a user opens ABC-5, picks "Add blocker", and selects ABC-3
- **THEN** ABC-3 shows under "Blocked by" with its status

#### Scenario: Rejected link in the detail view
- **WHEN** a user picks a task that makes a cycle
- **THEN** the view shows the cycle error and the sections do not change

### Requirement: Warn before starting blocked work
When a user delegates a blocked task, or moves it to `in_progress` in the UI, the system SHALL ask for confirmation first and SHALL list the open blockers. If the user confirms, the action SHALL continue. If the user cancels, nothing SHALL change. A ready task SHALL NOT trigger this confirmation.

#### Scenario: Delegate a blocked task
- **WHEN** a user delegates ABC-5 while ABC-3 blocks it
- **THEN** the system asks to confirm and names ABC-3

#### Scenario: Cancel the confirmation
- **WHEN** a user cancels the confirmation after dragging blocked ABC-5 to `in_progress`
- **THEN** ABC-5 keeps its old status

#### Scenario: Confirm
- **WHEN** a user confirms
- **THEN** the task is delegated or moved as asked

### Requirement: CLI warns without prompting
The CLI SHALL NOT prompt. When `bb tasks update` sets a blocked task to `in_progress`, or `bb tasks dispatch` delegates a blocked task, the command SHALL succeed and SHALL print a warning that names the open blockers. With `--json`, the output SHALL include the warning in a `warnings` array.

#### Scenario: Agent starts a blocked task
- **WHEN** an agent runs `bb tasks update ABC-5 --status in_progress` while ABC-3 blocks it
- **THEN** the status changes and the output warns that ABC-3 blocks ABC-5

### Requirement: CLI dependency commands
The CLI SHALL support:
- `bb tasks update <task> --blocked-by <task>` to add a blocker, repeatable.
- `bb tasks update <task> --unblocked-by <task>` to remove a blocker, repeatable.
- `bb tasks list --ready` and `bb tasks list --blocked`, which SHALL NOT be used together.
- `bb tasks show <task>`, which SHALL list blockers and blocked tasks with key, title, and status, and SHALL say if the task is blocked.

Task arguments SHALL accept a task key or ID. With `--json`, task output SHALL include `blockedBy`, `blocks`, and `blocked`.

#### Scenario: Add a blocker from the CLI
- **WHEN** an agent runs `bb tasks update ABC-5 --blocked-by ABC-3`
- **THEN** ABC-3 blocks ABC-5

#### Scenario: List ready work
- **WHEN** an agent runs `bb tasks list --project ABC --ready`
- **THEN** only ready tasks of project ABC are listed

#### Scenario: Conflicting filters
- **WHEN** an agent runs `bb tasks list --ready --blocked`
- **THEN** the command fails with an error that the flags cannot be combined

#### Scenario: Cycle from the CLI
- **WHEN** an agent adds a link that makes a cycle
- **THEN** the command fails, names the tasks in the cycle, and saves nothing

### Requirement: Delegation prompt lists blockers
The prompt that a delegated worker receives SHALL have a "Blocked by" section. It SHALL list each blocker with key, title, and status, or "None." when there are no blockers.

#### Scenario: Delegated task with blockers
- **WHEN** ABC-5 is delegated while ABC-3 (`todo`) and ABC-2 (`done`) block it
- **THEN** the worker prompt lists ABC-3 as `todo` and ABC-2 as `done`

### Requirement: Unblocked comment
When a blocker changes to `done` or `canceled` and this makes a blocked task ready, the system SHALL add one system comment to that task: "Unblocked: <key> is <status>". It SHALL NOT notify or resume any agent thread. It SHALL NOT add a comment to a task that is still blocked by another open blocker.

#### Scenario: Last blocker done
- **WHEN** ABC-3 is the only open blocker of ABC-5 and goes to `done`
- **THEN** ABC-5 gets the system comment "Unblocked: ABC-3 is done"
- **AND** no agent thread of ABC-5 is messaged

#### Scenario: Other blocker still open
- **WHEN** ABC-3 and ABC-4 block ABC-5 and only ABC-3 goes to `done`
- **THEN** ABC-5 gets no comment

### Requirement: Tasks skill covers dependencies
The bundled `tasks` skill SHALL tell agents to run `bb tasks show` and check blockers before they start a task, and SHALL document the dependency flags.

#### Scenario: Skill text
- **WHEN** an agent reads the `tasks` skill
- **THEN** it finds the instruction to check blockers and the `--blocked-by`, `--unblocked-by`, `--ready`, and `--blocked` flags
