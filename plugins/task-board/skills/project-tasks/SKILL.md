---
name: project-tasks
description: Manage project tasks in BB using the Tasks plugin CLI. Use when the user asks to add, find, prioritize, update, link, complete, or delete a task in a BB project.
---

# Project tasks in BB

Use the `bb task-board` command. Tasks belong to a BB project and live in the plugin's SQLite store, not in a thread. A linked thread is optional.

1. Resolve the project with `bb status` or `bb project list`. Pass `--project <project-id>` when listing or adding.
2. List before changing an existing task. Use `bb task-board list --project <id> [--view backlog|focus|in-flight|out-of-focus|done] [--query text]` and `bb task-board show <task-id>` for its full fields and revision. Use its full ID; the board shortens display IDs, but the detail pane shows the full selectable ID.
3. Add with `bb task-board add --project <id> --prompt "What needs to happen" [--priority low|normal|high|urgent]`. Only the prompt is required; priority defaults to normal.
4. Change with `bb task-board update <task-id> --patch '{"status":"doing","focus":"focus"}'`. The patch can contain `prompt`, `priority`, `status` (`backlog`, `doing`, `done`), `focus` (`focus`, `out-of-focus`, or null), `labels` (string array), `dependsOn` (task ID array), and `threadId` (BB thread ID or null). To avoid overwriting a concurrent change, copy `updatedAt` from `show` into the patch as `expectedUpdatedAt`; if it conflicts, reload and reconcile before retrying. The prompt cannot be blank; to clear other fields, include their empty value explicitly.
5. Delete only when requested, with `bb task-board remove <task-id>`. To mark completion, update status to `done` instead.

`bb task-board list --project <id> --limit 200 --offset 0` returns JSON with `tasks` and `total`. Page through when total exceeds the returned count. Prerequisites must belong to the same project and be done before a task moves to `doing`; cycles are rejected. Linked threads must belong to the task's project. Report the resulting task ID and status.
