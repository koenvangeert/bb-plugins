## Why

In a parent task, the sub-task rows show only status, key, and title. A user cannot see which sub-tasks are blocked without opening each one. List rows and board cards already show this.

## What Changes

- Each sub-task row in the parent detail view shows the same dependency badges as list rows and board cards: "Blocked by N" and "Blocks N".
- The badges update live when a blocker changes status.
- The parent task stays ready. Blocked sub-tasks do not make the parent blocked.
- UI only. The sub-task data already has the blocker counts. No API or DB change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-dependencies`: add a requirement for dependency badges on sub-task rows in the parent detail view.

## Impact

- `plugins/tasks/views/detail/index.tsx`: the `SubTasksSection` row.
- `plugins/tasks/views/dependencies.tsx`: reused, no change expected.
- New UI test for the sub-task row badges.
