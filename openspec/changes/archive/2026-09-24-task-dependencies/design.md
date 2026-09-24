## Context

See proposal.md for the why. Facts that shape the design:

- Upstream source: `get-bb/bb`, `plugins/tasks`, v0.1.2. It is the same version as the bundled plugin on this machine. About 34k lines. It imports only `@get-bb/plugin-sdk` and npm packages. `package.json` lists `workspace:*` packages (`@bb/shared-ui`, `@bb/plugin-build`), but no source file imports them.
- Data: `bb.storage.database()` gives a per-plugin SQLite file at `<bb-data-dir>/plugins/<plugin-id>/data.db`. `db/schema.ts` applies an ordered `MIGRATIONS` array and records each version in `schema_version`. The bundled DB is at version 6.
- Attachments store `blob_path` relative to the plugin data folder (`attachments/index.ts`, `pathInside`).
- Subtasks use `tasks.parent_task_id`. There is no dependency concept.
- Existing hooks we build on:
  - `delegate/index.ts` builds the worker prompt from `markdownSection(...)` blocks. It already has a "Sub-tasks" section. It sets the status to `in_progress` on dispatch.
  - `createSystemComment` (in `delegate`) and `publishCommentsChanged` (in `api`) already post system comments. The thread lifecycle uses them.
  - A `task_list_revision` row goes up by one on each change (SQLite triggers), and this refreshes the UI.
- bb core lists `tasks` as an optional bundled plugin (`autoInstall: false`). It has no other special handling. `bb plugin install` reserves bundled plugin ids.
- Current data on this machine: 18 tasks, 1 preset, 7 thread links, 0 attachments.

## Goals / Non-Goals

**Goals:**
- Keep the diff against upstream small and in few places, so that a manual upstream merge stays possible.
- Compute blocked/ready from the current data. Do not store it.

**Non-Goals:**
- A general plugin extension point for Tasks.
- Automatic upstream sync.

## Decisions

### D1. Vendor upstream as the first commit, then change it
Copy `plugins/tasks` at the upstream commit into `plugins/tasks` here as one commit with no changes. Record the upstream commit SHA in `plugins/tasks/UPSTREAM.md`. All later commits are our changes.
- Why: `git diff <vendor-commit>` shows exactly our patch. An upstream merge is "copy the new version, re-apply the patch".
- Alternative: a git subtree of the whole `get-bb/bb` repo. Rejected: the repo is large and we need one folder.

### D2. Build like `github-insight`
Replace the `workspace:*` entries: remove `@bb/shared-ui` and `@bb/plugin-build`, and pin `@get-bb/plugin-sdk` to the same version as `github-insight`. Use `bb plugin build`. Remove the upstream `build` and `prepare:bundled` scripts.
- The source imports `@bb/shared-ui` through the `@/*` path alias (17 UI modules). Vendor them into `components/ui/`, `lib/`, and `hooks/` from the bb shadcn registry at `desktop-v0.43.4`, like `github-insight`. `delayed-loading` is not in the registry: copy it from `packages/shared-ui` at the upstream commit. Map `@/*` to `./*` in `tsconfig.json`.
- `bb plugin types` moves the host-shimmed packages (portal radix families, `sonner`, `vaul`) to `devDependencies`.
- Alternative: keep upstream's `build-official-plugins.mjs`. Rejected: it needs the bb monorepo.

### D3. Plugin id `tasks-plus`
The package name is `bb-plugin-tasks-plus` and the display name stays "Tasks". The CLI command name stays `tasks` (`cli/index.ts`, `name: "tasks"`).
- Spike result (task 1.1, bb 0.43): bb accepts it. bb only reserves core names (`RESERVED_BB_CLI_COMMANDS`: `status`, `thread`, `plugin`, ...). With both plugins enabled, the bundled plugin answers `bb tasks`. With the bundled plugin disabled, the fork answers.
- `bb plugin disable` unregisters the CLI command. `bb plugin remove` deletes settings, secrets, and schedules, but keeps `data.db`. So the migration disables the bundled plugin and does not remove it.

### D4. Data model: one link table
Migration 7 in `db/schema.ts`:

```
task_dependencies
  blocker_task_id  TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE
  blocked_task_id  TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE
  created_at       TEXT NOT NULL
  PRIMARY KEY (blocker_task_id, blocked_task_id)
  CHECK (blocker_task_id <> blocked_task_id)
  index on blocked_task_id
  + task_list_revision triggers on insert and delete
```

- `ON DELETE CASCADE` gives the "blocker deleted" scenario.
- The revision triggers make open lists and boards refresh when a link changes, like the other tables do.
- Alternative: a `blocked_by` JSON column on `tasks`. Rejected: no FK cascade, and reverse lookups ("Blocks") need a table scan.

### D5. Cycle check in the store, inside the insert transaction
Before the insert, walk from the new blocker along "blocked by" edges with a recursive CTE. If the walk reaches the blocked task, reject and return the path for the error message. Run the check and the insert in one transaction.
- Why: all writers (RPC, CLI, UI) go through the store, so one check covers all of them.

### D6. Blocked state is computed at read time
The store gets `dependencyState(taskIds)`. It returns, per task: open blocker ids, all blocker ids, and blocked task ids. A blocker is open when its status is not `done` or `canceled`. List and detail results get `blockedBy`, `blocks`, `openBlockerCount`, `openBlockedCount`, and `blocked`, in `shared/contract.ts`.
- The `--ready` / `--blocked` filter is a `NOT EXISTS` / `EXISTS` subquery on `task_dependencies` joined with the blocker's status. It works with the current cursor pagination.
- Alternative: store a `blocked` flag and update it on each status change. Rejected: every status write would need to update other rows, and a missed path leaves stale data.

### D7. Unblocked comment in the status-change path
In the store method that changes a task status, when the status goes into `done` or `canceled` from another status: find the tasks it blocks, and for each task that has no other open blocker, post a system comment "Unblocked: <key> is <status>". Use the existing `createSystemComment` and `publishCommentsChanged`. Do this in the same transaction as the status change. Do not notify threads (`notified_count` stays 0, and no steer call).
- Why in the store: the board drag, the detail menu, the CLI, and the RPC all go through it.

### D8. Warn: UI confirms, CLI and RPC return warnings
- UI: before a move to `in_progress` (board drop, status menu) or a dispatch from the Delegate menu, check `blocked`. If it is true, show a confirm dialog that lists the open blockers. Put this in one hook, which the board, list, and detail views use.
- CLI and RPC: the update and dispatch results get an optional `warnings: string[]`. The human CLI output prints each warning on stderr.
- Why no server-side check that blocks: the decision is to warn, not enforce.

### D9. Data import is a script, not plugin code
`plugins/tasks/scripts/import-bundled-data.sh`:
1. Stop if `<bb-data-dir>/plugins/tasks-plus/data.db` has one or more rows in `tasks`.
2. `sqlite3 <bb-data-dir>/plugins/tasks/data.db ".backup <tmp>"` for a consistent copy with the WAL applied.
3. Copy the backup to `<bb-data-dir>/plugins/tasks-plus/data.db`, and copy the attachment blob folders next to it. `blob_path` is relative, so the paths stay valid.
4. The fork applies migration 7 on its next start.

Run it while the fork is disabled. Why a script: a plugin should not read another plugin's data folder, and the schemas are the same up to version 6.

## Risks / Trade-offs

- [Both plugins enabled at the same time] → The bundled plugin answers `bb tasks`. The migration plan disables it before the fork is enabled.
- [Upstream changes and we fall behind] → D1 keeps our patch small and easy to see. No automatic sync.
- [Upstream later adds dependencies itself] → Accepted. Then we compare and either move back to the bundled plugin or map the data.
- [Recursive cycle check is slow on large graphs] → Accepted. Task graphs here are small (tens of tasks). The index on `blocked_task_id` keeps each step cheap.

## Migration Plan

1. Back up `<bb-data-dir>/plugins/tasks/` to a dated folder.
2. `bb plugin install --yes <repo>/plugins/tasks`, then `bb plugin disable tasks-plus`.
3. `bb plugin disable tasks` (the bundled plugin).
4. Run `import-bundled-data.sh` against the backup.
5. `bb plugin enable tasks-plus`. Check `bb tasks list` and the Tasks panel.

Rollback: `bb plugin remove tasks-plus`, `bb plugin enable tasks`. The bundled data folder is not changed by the migration. If it is damaged, restore the backup into `<bb-data-dir>/plugins/tasks/`.
