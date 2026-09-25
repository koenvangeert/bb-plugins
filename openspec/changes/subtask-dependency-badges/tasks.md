## 1. Tests first

- [x] 1.1 Add a UI test in `plugins/tasks/views/detail/` that renders a parent with three sub-tasks: one blocked, one blocking, one with no links. Assert "Blocked by 1", "Blocks 2", and no badge. Verify the test fails before 2.1.
- [x] 1.2 Add a UI test that fires `tasks:changed` after the blocker of the blocked sub-task goes to `done`. Assert the "Blocked by" badge goes away. Verify it fails before 2.1.

## 2. Sub-task row badges

- [x] 2.1 Render `DependencyBadges` in each `SubTasksSection` row in `plugins/tasks/views/detail/index.tsx`, after the title, with the list row sizing. Verify the tests from 1.1 and 1.2 pass.
- [ ] 2.2 Check that a long title still truncates and the badge does not wrap at narrow widths. Verify in the running app with `/run` or a screenshot.

## 3. Verify

- [x] 3.1 Run `npm run typecheck`, `npm run lint`, and `npm test` in `plugins/tasks`. Verify all pass.
