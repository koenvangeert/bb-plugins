## Context

- `views/list/data.ts` calls `listTasks` with `parentTaskId: null`, so subtasks never reach the client.
- Status, priority, label, Ready/Blocked, and active-work filters run on the server in `db/store.ts`. The client runs `matchesFilters` again on status, priority, and label so optimistic edits drop out of view at once.
- Tasks allow one level of subtasks, and a subtask is in the same project as its parent (`db/store.ts` `validateTaskParent`).
- The board already loads all tasks of a project and counts subtask progress on the client.

## Goals / Non-Goals

**Goals:**
- Build the nested list on the client with the existing `listTasks` RPC.
- Keep the tree logic in a pure function that unit tests can cover.

**Non-Goals:**
- No new RPC, no schema change, no CLI change.
- No drag-and-drop between parents and no reparenting from the list.
- No nesting deeper than one level.

## Decisions

### Two queries: matches and scope

- **Matches:** the current filtered query without `parentTaskId: null`. It returns the parents and subtasks that match.
- **Scope:** `listAllTasks({ projectId })` with no filters. It gives the parent of a matching subtask, all subtasks for the done count, and the children when no filter is active.
- With no active filter and not the active-work view, both queries are the same, so the list runs only one.

Alternative: add a server option such as `includeParents` plus subtask counts on `Task`. That changes the contract, the store query, and the CLI JSON. The client approach needs no contract change, and the unfiltered list already loads every task in scope.

### Pure tree builder

`buildListTree(matches, scope, filtered)` in `views/list/lib.ts` returns top-level entries:

```
{ task, dimmed, children: Task[], subDone, subTotal, autoExpand }
```

- Not filtered: every top-level task, and all its subtasks as children.
- Filtered: every matching top-level task, plus the parent of each matching subtask with `dimmed: true`. Children are only the matching subtasks. `autoExpand` is true when children is not empty.
- `subDone` and `subTotal` come from scope, so a filter does not change them.

The list sorts entries with `sortTasks`, groups them by the parent's status, and sorts children with the same `sortTasks`.

### Optimistic edits

`editedTasks` and `matchesFilters` run on the matches before the tree builder. `editedTasks` also runs on the scope, so the done count follows a status edit at once.

### Expand state

- New module `views/list/expanded-tasks.ts` stores a versioned set of expanded task ids in localStorage under `bb-tasks:list-expanded`. It uses the same read and validate pattern as `list-preference.ts`.
- No filter: a parent is expanded when its id is in the saved set. A toggle updates the set.
- Filter active: a parent is expanded when `autoExpand` is true. A toggle is kept in component state for the current filter only and does not change the saved set. This keeps a filter from rewriting the saved layout.

### Row rendering

`TaskRow` gets optional props: `depth`, `dimmed`, `expanded`, `onToggleExpanded`, and `subProgress`. The chevron is a separate button that stops the click from reaching the row. Subtask rows use the same menus, so status and priority edits work the same.

### Counts

- The group header counts the top-level entries in the group.
- The filter bar count is the number of matches after `matchesFilters`.
- `useTaskListMeta` and scroll restoration use the visible rows, so thread lookups do not run for hidden subtasks.

## Risks / Trade-offs

- [The scope query loads all tasks of the project, or of all projects in the "All" view] → the unfiltered list already does this today. The board does the same per project.
- [A second query adds one more round trip when a filter is active] → both queries run in parallel and share the same invalidation channels.
- [Saved ids of deleted tasks stay in localStorage] → unknown ids have no effect. The store drops ids that are not in scope when it writes.
