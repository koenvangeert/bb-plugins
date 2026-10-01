## Context

Source: `openforge-plugins/plugins/claude-usage` (Svelte, OpenForge plugin SDK). About 80% of it is host-free TypeScript: transcript parsing, the spend index, pricing, the scanner, and the dashboard aggregation. The rest binds to OpenForge: file access, storage, project/task/session lookup, and Svelte views.

BB constraints that shape the port:

- The SDK exposes no Claude Code session id per thread. Transcripts carry only `cwd` and Claude Code's own `sessionId`.
- Worktree environments have a unique path per thread (`.../worktrees/thr_<id>-1/<repo>`). Local environments share the project source path.
- `bb.storage.kv` caps values at 256KB. The OpenForge index is one JSON file that grows forever.
- The plugin backend runs on the BB server host. Threads on other hosts write transcripts on those hosts.

## Goals / Non-Goals

**Goals:**

- Same figures as the OpenForge plugin for the same transcripts.
- Keep the host-free modules close to the source, with their tests, so fixes can move between the two.

**Non-Goals:**

- Subscription or rate-limit usage (the user bills through the API).
- Reading transcripts on remote hosts.
- Per-thread attribution in shared environments.
- Showing Claude Code's `cost-state` totals.

## Decisions

### 1. Package layout: `plugins/claude-usage/`, scaffolded with `bb plugin new`

Matches the layout the earlier plugins in this repo used. The scaffold gives the current manifest, React frontend, and build. Alternative: copy the OpenForge package and swap the SDK. Rejected: its Vite/Svelte build does not fit BB's frontend contract.

### 2. Port host-free modules as-is, inject host access

`transcript.ts`, `pricing.ts`, `spendIndex.ts`, `scanner.ts`, `dashboard.ts`, `dailyChartConfig.ts`, `format.ts`, and their tests move over with minimal edits. The scanner keeps its `TranscriptFileSystem` interface. The BB implementation uses `node:fs` directly, because the backend runs on the same host as `~/.claude`.

### 3. Index storage: plugin SQLite database

Rows go in `bb.storage.database()`, one table for per-transcript stats (path, size, mtime) and one for token rows (transcript, UTC hour, model, cwd, five token classes). Re-reading a transcript deletes and re-inserts its rows in one transaction. Alternative: one JSON blob in `kv`. Rejected: the 256KB cap fails after weeks of history. A JSON file in the data dir would work but rewrites the whole history on every scan.

The index module keeps its pure in-memory shape for tests. A thin repository layer maps it to SQL.

### 4. Attribution: directory prefix, thread only for single-thread environments

Inputs, cached for 30 seconds as in the source:

- `bb.sdk.projects.list` and each project's `local_path` sources: project directories.
- `bb.sdk.environments.list`: environment `path` and `projectId`.
- `bb.sdk.threads.list` (including archived): `environmentId`, `providerId`.

An environment maps to a thread when exactly one `claude-code` thread uses it. All directories sort longest first, and a `cwd` resolves to the first prefix match.

This differs from the OpenForge rule, which bans directory-based task attribution and uses session ids. BB gives no session ids, and a worktree path names one thread, so directory matching is safe there. Shared environments fall back to the project only.

### 4a. Attribution survives environment cleanup

Found during implementation: BB keeps a destroyed environment's record but sets its `path` to `null`. On the author's machine, 31 transcript folders come from BB worktrees and only 7 environments still had a path. Without a fix, most thread spend lands in "Outside BB".

- **Remember:** each attribution load stores every live environment (id, project, path) in the plugin database. A stored path is kept after BB destroys the environment. Threads keep their `environmentId` when archived, so the thread link survives.
- **Parse:** a `cwd` that matches no live or remembered path, and contains `/worktrees/thr_<id>-<n>`, resolves to thread `thr_<id>` when BB knows that thread. This recovers worktrees destroyed before the plugin was installed.

Parsing depends on the git-worktree provider's folder naming. If that naming changes, the fallback stops matching and spend degrades to "Outside BB". It never attributes to a wrong thread, because the parsed id must exist in BB.

Projects load with `includePersonal`, so threads in the Personal project show its name. It has no source paths, so it adds no directories.

### 5. Frontend: React, BB slots

| Surface | BB slot |
| --- | --- |
| Dashboard page | `navPanel` (app-level, no project) |
| 30-day figure on the row | `experimental_sidebarAccessory` on that panel |
| Thread figure | `experimental_threadHeaderAction` |
| Data | `bb.rpc` contract: `dashboard`, `threadSpend`, `rescan` |

The thread header was chosen over a thread panel tab: one figure needs no tab. The Svelte components are rewritten in React. Logic stays in the ported modules.

### 6. Chart: Chart.js on a canvas, colours from theme CSS variables

Kept from the source. The source moved to canvas because host utility classes can be missing from the compiled CSS. That risk is the same in BB.

### 7. Rescan interval: `bb.settings` number, read before each wait

`bb.background.service` with the abort signal replaces the OpenForge background registration. The loop reads the setting before each sleep, as in the source.

### 8. Pricing: exact model match, add current models

The source matches by prefix, so `claude-opus-5-5` resolves to `claude-opus-5`. Local transcripts already hold 9,500+ `claude-opus-5-5` records. The port matches exactly after removing `[...]` and `-YYYYMMDD` suffixes. Then `claude-opus-5-5` is unpriced until its rate is added. The banner exposes the gap instead of a silent wrong price.

## Risks / Trade-offs

- [Local-environment threads show "no spend recorded"] → The dashboard project total still includes their spend. The thread header says why.
- [Remote-host threads are missing] → They show as no spend. The lower-bound note covers it.
- [Price table drifts from Anthropic list prices] → Unpriced models show in a banner. Updating the table is a code change.
- [Transcripts under-report usage by a few percent] → Figures are labelled as a lower bound, as in the source.
- [First scan of a large `~/.claude` is slow] → The scan streams files in 256KB chunks and yields between files. The dashboard shows an indexing state until the first scan ends.
- [SDK slots are `experimental_`] → Pin the SDK version. Run `bb plugin types` on upgrades.

## Migration Plan

New plugin, no existing data. Install with `bb plugin install ./plugins/claude-usage`. Rollback: disable or remove the plugin. Its database is removed with it.

## Open Questions

- The `claude-opus-5-5` rate is not in the source table. Confirm it from Anthropic's pricing page during implementation. This does not change the specs: until then the model is unpriced.
