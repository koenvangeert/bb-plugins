## Context

See proposal.md for motivation, and the specs for behavior.

Prior art: OpenForge reads Jira in its Rust core (`src-tauri/src/jira_runtime/`) over REST v3 with an API token, and its `github-sync` plugin resolves keys and stores snapshots. This plugin uses `acli` instead, so only two pieces carry over: the ADF-to-text flattening (`adf.rs`) and the error mapping (401, 403, 404).

BB facts that shape the design:

- Each plugin has its own JSON namespace on a thread: `bb.sdk.threads.getPluginMetadata`, `updatePluginMetadata`, and `spawn({ pluginMetadata })`.
- No SDK call lists threads by plugin metadata.
- The plugin server runs in the BB server process and may use `child_process`.
- UI slots: `navPanel` (sidebar page), `experimental_threadHeaderAction` (one 28px control, taller content in a popover), shadcn `dialog`.
- `claude-usage` in this repo already uses `bb.storage.database()`, a service loop that re-reads its interval, and a typed RPC contract. This plugin copies those patterns.

## Goals / Non-Goals

**Goals:**

- Jira access logic (acli calls, parsing, error mapping, ADF to text) is host-free and unit-tested against recorded `acli` JSON.
- The ticket list renders from cache, without waiting for `acli`.

**Non-Goals:**

- Running `acli` on remote hosts. It runs on the BB server host only.
- Live updates from Jira (webhooks). Polling only.

## Decisions

### 1. Package layout: `plugins/jira/`, scaffolded with `bb plugin new`

Same layout as `plugins/claude-usage/`: `server.ts`, `app.tsx`, logic in `src/*.ts` with vitest tests next to each module.

### 2. `acli` runner behind an interface

`src/acli.ts` has an `AcliRunner` interface: `run(args: string[]): Promise<{ stdout, stderr, exitCode }>`. The real runner uses `execFile("acli", args, { timeout: 30_000 })`. No shell, so a JQL value cannot inject commands. Tests use a fake runner with recorded output.

Commands:

| Purpose | Command |
|---|---|
| List | `acli jira workitem search --jql <jql> --fields key,summary,status,issuetype --limit 200 --json` |
| One ticket | `acli jira workitem view <KEY> --fields key,summary,status,issuetype,description --json` |
| Health | `acli jira auth status` |

Alternative: Jira REST with an API token. Rejected by the user: they already use `acli` and do not want another token.

### 3. Error classification

`src/acliErrors.ts` maps a result to `missing` (ENOENT on spawn), `loggedOut` (auth status fails, or search stderr names auth), `notFound` (view of an unknown key), `timeout`, or `failed` (any other non-zero exit, with stderr text). `missing` and `loggedOut` set `bb.status.needsConfiguration(...)`. The SDK clears that status only on plugin reload, so after a fix the page message goes on the next good refresh and the plugin status goes after `bb plugin reload jira`.

### 4. Cache in the plugin database

`bb.storage.database()` with two tables:

- `tickets(key, summary, status, status_category, issue_type, url, position)`, replaced in one transaction on each successful refresh.
- `refresh_state(id=1, refreshed_at, error, health)`. A failed refresh writes only `error` and `health`, so the last good list stays.

Alternative: `bb.storage.kv`. Workable at 200 tickets, but the thread-link index below needs SQL, so one store for both.

### 5. Thread links: metadata is the truth, a table is the index

Linking writes `{ issueKey }` to the thread's plugin metadata and upserts `thread_links(thread_id PRIMARY KEY, issue_key)`. Unlinking clears both. `spawn` sets `pluginMetadata` directly, then upserts the row.

The index exists because no SDK call lists threads by metadata. To keep it honest:

- The thread header reads metadata, not the index.
- The sidebar page resolves index rows through `bb.sdk.threads.get`. A missing thread drops its row. An archived thread is shown as archived.
- A thread delete event drops the row.

Alternative: index only, no metadata. Rejected: a reinstall or DB loss would lose every link.

### 6. Refresh loop

Copy `claude-usage`'s `rescanLoop`: refresh at start, then wait `refreshMinutes`, re-read the setting before each wait, stop on abort. A single-flight guard joins a manual Refresh to a refresh that is already running. `bb.background.schedule` was rejected because its cron is fixed at registration.

### 7. Ticket URL

The browse URL is `https://<site>/browse/<KEY>`. The site comes from `acli jira auth status` (`Site: <name>.atlassian.net`), read once and cached. The search JSON has a `self` link, but it points to an internal Atlassian host, not to the user's site, so the plugin does not use it. If the site cannot be read, the URL is empty and the UI hides the Jira link.

### 8. ADF description to text

Port OpenForge `jira_runtime/adf.rs` to `src/adf.ts`, with its tests. The prompt prefill uses it.

### 9. RPC contract

`src/rpc.ts` defines: `tickets()` (cache plus linked threads plus refresh state), `refresh()`, `ticket(key)` (one ticket, `view`, with description), `threadLink(threadId)`, `link(threadId, key)`, `unlink(threadId)`, `projects()`, `startThread(projectId, key, prompt)`.

`link` with a key not in the cache calls `ticket(key)` first, and fails if that fails.

### 10. Permission mode of a started thread

`startThread` reads `bb.sdk.projects.defaultExecutionOptions({ projectId })` and spawns with `permissionMode: defaults?.permissionMode ?? 'full'` and `executionInputSources: { permissionMode: 'explicit' }`.

- The composer falls back to a remembered client preference when the project has no stored default. The plugin server cannot read that preference. Without a value, `spawn` falls back to the provider default, which is sandboxed. The user wants Jira threads to have full access, so `full` is the fallback.
- When a project has a stored default, the server already uses it. Reading it here only keeps that behavior when we send a value.
- The `explicit` source is necessary: without a source, the server can drop a requested execution value and use its own default.

Alternative: embed the host `NewThreadComposer` in the Start dialog, so its pickers set the mode. Rejected for now: it is the only exact match with the composer, but it replaces the dialog.

### 11. Frontend

- `navPanel` "Jira": refresh state line, health banner, ticket rows, thread chips, "Start thread".
- Start dialog: project select (from `projects()`), textarea prefilled from `ticket(key)`, Start button disabled until a project is picked. On success, `useBbNavigate().toThread(id)`.
- `experimental_threadHeaderAction`: one chip (`KEY . Status`, or "Link Jira"). The popover holds details, the picker (cached tickets plus a key input), and unlink.

## Risks / Trade-offs

- [The `acli` JSON shape is not documented and can change] → Parse with zod, keep recorded fixtures in tests, and show a clear "unexpected acli output" error instead of a crash.
- [`acli` exists only on the BB server host] → Fine for a single-machine setup. The health check says so when it is missing.
- [OAuth tokens in `acli` expire] → The `loggedOut` health state tells the user to run `acli jira auth login`.
- [The index can go stale if another plugin or a reinstall changes metadata] → The header reads metadata, and the page drops rows whose thread is gone. A row whose metadata no longer matches is dropped when the page resolves it.
- [200-ticket limit] → Enough for "assigned to me". The page says when the limit is hit.
