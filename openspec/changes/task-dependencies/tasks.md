## 1. Spike

- [x] 1.1 Build a throwaway plugin with id `tasks-plus` that registers a `tasks` CLI command. Uninstall the bundled `tasks` plugin first (back up `<bb-data-dir>/plugins/tasks/` before). Verify that `bb tasks status` reaches the throwaway plugin. Record the result in design.md (D3). If bb refuses, stop and update the spec before other work. Also record if `bb plugin remove tasks` deleted the data folder.

## 2. Vendor and build

- [x] 2.1 Copy `get-bb/bb` `plugins/tasks` at the current upstream commit into `plugins/tasks` as one commit with no changes, and add `UPSTREAM.md` with the commit SHA; verify `git show --stat` lists only upstream files plus `UPSTREAM.md`
- [x] 2.2 Set package name `bb-plugin-tasks-plus`, remove the `workspace:*` entries and upstream build scripts, and pin `@get-bb/plugin-sdk` to the `github-insight` version (D2); verify `npm install`, `npm run typecheck`, `npm test`, and `bb plugin build` pass with no source changes
- [x] 2.3 Install the fork from `plugins/tasks` on an empty data folder; verify `bb plugin list` shows it running and the existing upstream tests still pass

## 3. Data model

- [x] 3.1 Add migration 7 with `task_dependencies`, the CHECK, the index, and the revision triggers (D4); verify a db test applies it on a version 6 DB and a new-DB test
- [x] 3.2 Add store methods to add and remove a link, with the self-link and cycle check in one transaction (D5); verify db tests: add, add twice keeps one link, remove, self-link rejected, a 3-task cycle rejected with the path in the error, and a cross-project link saved
- [x] 3.3 Add `dependencyState(taskIds)` with the open-blocker rule (D6); verify db tests: `todo` blocker gives blocked, `done` + `canceled` gives ready, reopened blocker gives blocked again, open subtask does not block the parent, and deleting a blocker removes the link
- [x] 3.4 Add the ready and blocked filters to the list query; verify db tests that the filters work with cursor pagination across two pages

## 4. Unblocked comment

- [x] 4.1 In the status-change path, post "Unblocked: <key> is <status>" on each task that becomes ready (D7); verify tests: last blocker `done` gives one comment, another open blocker gives no comment, `done` to `done` gives no comment, and no thread is notified

## 5. Contract, RPC, and CLI

- [x] 5.1 Add `blockedBy`, `blocks`, `openBlockerCount`, `openBlockedCount`, `blocked`, and optional `warnings` to `shared/contract.ts` and the API results, plus RPCs to add and remove a link; verify api tests for each field and for the cycle error
- [x] 5.2 Add `--blocked-by` and `--unblocked-by` (repeatable, key or ID) to `bb tasks update`; verify cli tests for add, remove, and the cycle error with nothing saved
- [x] 5.3 Add `--ready` and `--blocked` to `bb tasks list`, with an error when both are given; verify cli tests
- [x] 5.4 Show blockers, blocked tasks, and the blocked state in `bb tasks show`, human and `--json`; verify cli tests
- [x] 5.5 Return and print the warning when `update --status in_progress` or `dispatch` runs on a blocked task (D8); verify cli tests that the command succeeds, prints to stderr, and puts the warning in `warnings` with `--json`

## 6. Delegation and skill

- [x] 6.1 Add a "Blocked by" section to the worker prompt, with "None." when empty; verify a delegate test with one `todo` and one `done` blocker
- [x] 6.2 Update `skills/tasks/SKILL.md` and the README: check blockers before starting, and document the four flags; verify the skill text lists all four flags

## 7. UI

- [x] 7.1 Add the "Blocked by N" / "Blocks N" badge to list rows and board cards; verify component tests for blocked, blocking, and no badge
- [x] 7.2 Add the All / Ready / Blocked filter to the filter bar and keep it in the list preference; verify component tests that each value shows the right tasks
- [x] 7.3 Add "Blocked by" and "Blocks" sections to the detail view, with a task picker to add links and a remove action; verify component tests for add, remove, click to open, and the cycle error with no change
- [x] 7.4 Add one confirm hook for blocked work and use it in the board drop, the status menu, and the Delegate menu (D8); verify component tests: blocked task asks and lists blockers, cancel keeps the old status, confirm continues, ready task does not ask

## 8. Migration and check

- [x] 8.1 Write `plugins/tasks/scripts/import-bundled-data.sh` (D9) and add the migration and rollback steps to the README; verify on a copy of the real data folder that 18 tasks, 1 preset, and 7 thread links arrive with the same keys, and that a second run stops with an error
- [ ] 8.2 Run the migration plan on this machine; verify in the Tasks panel that existing tasks show, add a link ABC-3 blocks ABC-5, see the badge, the filter, the confirm dialog, and the unblocked comment when ABC-3 goes to `done`
- [x] 8.3 Run `openspec validate task-dependencies --strict`, `npm run typecheck`, and `npm test` in `plugins/tasks`; verify all pass
