## Why

The bb Tasks plugin has subtasks, but a task cannot say "I must wait for ABC-3". So you cannot see which work is ready to start and which work waits on other work. Agents cannot see it either when they get a delegated task.

## What Changes

- New plugin in this repo: a fork of the bundled bb Tasks plugin (`get-bb/bb`, `plugins/tasks`, v0.1.2). It replaces the bundled plugin.
  - It has a new plugin id, because bb reserves bundled plugin ids.
  - It keeps the `bb tasks` command, the `tasks` skill, and the `@` Tasks mention.
  - A one-time step copies the data of the bundled plugin (tasks, comments, presets, labels) into the fork.
- Task dependencies: "ABC-3 blocks ABC-5".
  - A task is **blocked** while one or more of its blockers has a status other than `done` or `canceled`. Otherwise it is **ready**.
  - Links can go across projects. Self-links and cycles are rejected.
  - Subtasks stay separate. An open subtask does not block its parent.
- UI:
  - A "Blocked by N" or "Blocks N" badge on list rows and board cards.
  - A Ready / Blocked filter in the filter bar.
  - "Blocked by" and "Blocks" sections in the task detail view, where you can add and remove links.
- Warn, do not enforce: the UI asks you to confirm before you delegate a blocked task or move it to `in_progress`.
- When a blocker goes to `done` or `canceled` and the blocked task becomes ready, the blocked task gets a system comment: "Unblocked: ABC-3 is done".
- Agent surface:
  - `bb tasks update X --blocked-by Y` and `--unblocked-by Y`.
  - `bb tasks list --ready` and `--blocked`.
  - `bb tasks show` lists blockers and blocked tasks.
  - The delegation prompt lists the task's blockers and their status.
  - The `tasks` skill tells agents to check blockers before they start.

Out of scope:
- A dependency graph view.
- Waking or messaging the agent thread of a task when it becomes ready.
- Keeping the fork in sync with upstream. That is manual.

## Capabilities

### New Capabilities
- `task-dependencies`: blocker links between tasks, the blocked/ready rule, and how the UI, CLI, delegation, and comments show them.
- `tasks-fork`: the fork replaces the bundled Tasks plugin: identity, `bb tasks` command, and data migration.

### Modified Capabilities
- None. The repo has no specs for Tasks yet.

## Impact

- New folder `plugins/tasks` (fork source) in this repo. It builds with `bb plugin build`, like `plugins/github-insight`.
- New SQLite migration in the fork: table `task_dependencies`.
- Changed modules in the fork: `db`, `api`, `cli`, `delegate`, `shared/contract`, `views/list`, `views/board`, `views/detail`, `skills/tasks`.
- `package.json` changes: `workspace:*` dependencies become pinned npm versions. `@get-bb/plugin-sdk` is pinned like in `github-insight`.
- Your machine: the bundled `tasks` plugin is uninstalled, and the fork is installed from this repo.
