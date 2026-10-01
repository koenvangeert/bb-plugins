## 1. Tree logic

- [x] 1.1 Add `buildListTree(matches, scope, filtered)` to `views/list/lib.ts` and verify `lib.test.ts` covers: unfiltered nesting, only-subtask match (dimmed, autoExpand), only-parent match (no children), no match, and done count from scope
- [x] 1.2 Add a helper that groups tree entries by parent status and sorts parents and children with `sortTasks`, and verify a test shows a `done` subtask stays under an `in_progress` parent in priority order

## 2. Data loading

- [x] 2.1 Change `useListTasks` in `views/list/data.ts` to drop `parentTaskId: null` and add the unfiltered scope query, skipped when no filter is active and not the active-work view; verify with a test that the RPC gets both calls only when filtered
- [x] 2.2 Apply `editedTasks` to the scope as well as the matches, and verify a test shows the done count changes after an optimistic status edit

## 3. Expand state

- [x] 3.1 Add `views/list/expanded-tasks.ts` with versioned load and store of expanded ids under `bb-tasks:list-expanded`, and verify tests cover a round trip, bad stored JSON, and drop of ids not in scope
- [x] 3.2 Add a hook that returns expanded state per parent: saved set with no filter, `autoExpand` plus session toggles with a filter; verify a test shows a toggle under a filter does not change the saved set

## 4. Rendering

- [x] 4.1 Add `depth`, `dimmed`, `expanded`, `onToggleExpanded`, and `subProgress` props to `TaskRow`, with a chevron button that does not open the task; verify `subtasks.test.tsx` covers chevron click, done count, dimmed style, and no chevron without visible subtasks
- [x] 4.2 Render the tree in `views/list/index.tsx`: group header counts parents, filter bar counts matches, meta and scroll restoration use visible rows; verify with a list test for each scenario in `specs/task-list-subtasks/spec.md`

## 5. Verification

- [x] 5.1 Run `npm run typecheck`, `npm run lint`, and `npm test` in `plugins/tasks` and verify all pass
- [x] 5.2 Run `openspec validate list-subtask-nesting --strict` and verify it passes
