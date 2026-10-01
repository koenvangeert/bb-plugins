## Why

The task list shows top-level tasks only. Subtasks never load, so a user cannot see or filter them without opening each parent.

## What Changes

- The list view shows subtasks as nested rows under their parent, with a chevron to expand and collapse.
- A subtask stays under its parent in the parent's status group, whatever its own status.
- A parent row with subtasks shows a done count, for example "2/3".
- With an active filter, a row shows when the parent or any subtask matches. A parent that does not match shows dimmed as context. Subtasks that do not match stay hidden.
- Parents are collapsed by default. A parent opens by itself when a filter matches one of its subtasks.
- The list saves each expand and collapse toggle in localStorage.
- The board view does not change.

## Capabilities

### New Capabilities

- `task-list-subtasks`: how the list view shows, filters, and expands subtasks.

### Modified Capabilities

None.

## Impact

- `plugins/tasks/views/list/`: data loading (`data.ts`), grouping (`lib.ts`), rendering (`index.tsx`, `row.tsx`), and a new expand-state store.
- No change to the RPC contract, the database, or the CLI. The list uses the existing `listTasks` filters.
