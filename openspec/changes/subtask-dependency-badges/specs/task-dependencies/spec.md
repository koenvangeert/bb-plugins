## ADDED Requirements

### Requirement: Badges on sub-task rows
In the detail view of a parent task, each sub-task row SHALL show the same dependency badges as a list row: "Blocked by N" when the sub-task is blocked, and "Blocks N" when it blocks N tasks that are not `done` or `canceled`. A sub-task with neither SHALL show no dependency badge. The badges SHALL NOT change the state of the parent.

#### Scenario: Blocked sub-task
- **WHEN** a user opens ABC-1 and its sub-task ABC-2 has 1 open blocker
- **THEN** the ABC-2 row shows "Blocked by 1"

#### Scenario: Blocking sub-task
- **WHEN** a user opens ABC-1 and its sub-task ABC-2 blocks 2 open tasks and has no open blockers
- **THEN** the ABC-2 row shows "Blocks 2"

#### Scenario: Sub-task without dependencies
- **WHEN** a user opens ABC-1 and its sub-task ABC-2 has no blockers and blocks no open tasks
- **THEN** the ABC-2 row shows no dependency badge

#### Scenario: Badge updates
- **WHEN** the only blocker of sub-task ABC-2 goes to `done` while ABC-1 is open
- **THEN** the "Blocked by" badge leaves the ABC-2 row without a manual refresh

#### Scenario: Parent stays ready
- **WHEN** sub-task ABC-2 is blocked and ABC-1 has no blockers
- **THEN** ABC-1 is ready
