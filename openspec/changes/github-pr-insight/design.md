## Context

- bb core already finds the PR of a thread's environment. It runs `gh pr view` on the host and exposes the result as `bb.sdk.environments.pullRequest({ id })` (number, url, state, check counts, attention). It has no check names, no reasons, and no reviewer names.
- A plugin cannot change the core PR pill. It can add a right panel tab (`threadPanelAction`) and a composer banner (`app.composer.customize({ banners })`).
- Plugins cannot call each other. Thread plugin metadata is readable by any plugin (`threads.getPluginMetadata({ threadId, pluginId })`), so it is the channel to dockside.
- A test query on `collibra/frontend#25392` showed:
  - 88 check runs and 5 status contexts on the head commit. Many names repeat because of re-runs and cancels.
  - GitHub Actions check runs have an empty `title` and `summary`. Annotations carry the only reason text, mixed with lint warnings.
  - `reviewRequests.asCodeOwner` tells if a requested reviewer is a code owner.

## Goals / Non-Goals

**Goals:**
- One GitHub read path that the tab, the banner, and the summary all use.
- Keep the parsing and mapping in pure functions that tests can run on recorded GitHub responses.
- Keep GitHub traffic small enough for many open threads.

**Non-Goals:**
- A shared library for other plugins. The metadata summary is the only public contract.
- Webhooks or push updates from GitHub.
- Support for GitHub hosts other than github.com in the first release. GitHub Enterprise works only if `gh` is already set up for that host, and it is not tested.

## Decisions

### D1: Run `gh api graphql` in a `bb.host` entry

```
server (bb.server)                     host daemon (bb.host)
+---------------------------+  call    +-------------------------+
| poll service              | -------> | fetchPr(owner,repo,num) |
|  - list threads with PR   |  hostId  |  gh api graphql ...     |
|  - schedule per PR        | <------- |  returns raw JSON       |
|  - parse + cache          |          +-------------------------+
|  - write metadata summary |
|  - realtime publish       |
+---------------------------+
```

- The host entry runs on the host that owns the thread's environment. It uses that host's `gh` login, so remote hosts work too.
- The host entry only runs `gh` and returns the raw JSON. All parsing is on the server, in pure functions.
- Alternatives:
  - `gh pr view --json`: has no annotations, no `asCodeOwner`, no review threads. Rejected.
  - Direct HTTPS with a token: needs a secret setting and a second login. Rejected by the "no new token" decision.
  - Run `gh` in the server process: wrong for threads on remote hosts. Rejected.

### D2: Two GraphQL calls per refresh

1. **Overview query**: PR state, draft, `mergeStateStatus`, `reviewDecision`, `reviewRequests` (with `asCodeOwner`), `latestOpinionatedReviews`, `reviewThreads { isResolved }`, and `statusCheckRollup.contexts` with `CheckRun { id databaseId name status conclusion detailsUrl startedAt title summary }` and `StatusContext { context state description targetUrl createdAt }`. Page through contexts, up to 5 pages of 100.
2. **Detail query**: `nodes(ids: [...])` for the newest failed or cancelled check runs only, with `annotations(first: 20)` (filtered to failure level on the server, first 5 shown) and `totalCount`.

- Why: asking annotations for all 88 runs makes the query large and slow. After deduplication only a few runs need them.
- The detail query is skipped when no check failed or was cancelled.

### D3: Pure core module

`core/` holds functions with no I/O:
- `dedupeChecks`: one entry per name, newest by `startedAt`, then by `databaseId`. For status contexts, newest by `createdAt`.
- `mapCheckStatus`: the status table in the `pr-insight-data` spec.
- `checkReason`: title, then summary, then first failure annotation, then description.
- `buildReviewers`: an open request wins (pending), then the latest opinionated review.
- `buildBlockers`: fixed order, most important first: `conflicts`, `checks_failed`, `changes_requested`, `behind`, `review_required`, `unresolved_threads`, `checks_running`, `draft`, `blocked`. `blocked` only when no other code applies and GitHub says `BLOCKED`.
- `buildSummary`: the version 1 metadata object. Asserts the 4 KiB limit.

Tests use a recorded, trimmed response of `collibra/frontend#25392` as fixture.

### D4: Poll service on the server

- `bb.background.service("pr-poller")` runs a loop:
  1. Every 60 seconds, list threads that are not archived.
  2. Group them by environment. Get `environments.pullRequest` for each environment (bb caches this for 10 seconds).
  3. Group by PR (`owner/repo#number`). One refresh per PR, even when threads share it.
  4. Run at most 4 refreshes at the same time.
- A PR that is merged or closed gets one last refresh, then it leaves the loop until bb reports it open again.
- On a rate-limit error, the loop waits until the reset time that `gh` reports, or 5 minutes when there is none.
- Manual refresh is an RPC `refresh({ threadId })` that runs the same refresh at once, outside the loop.

### D5: Cache and delivery

- Full insight per PR lives in server memory (a map keyed by `owner/repo#number`). It is lost on plugin restart and rebuilt by the next poll.
- RPC `getInsight({ threadId })` returns the full insight or the "no PR" / error state.
- After each refresh that changes the data, the server:
  - publishes a realtime event `insight.updated` with the thread ids, so open tabs and banners refetch, and
  - writes `prSummary` to each thread's `github-insight` metadata namespace, only when the summary changed (compare JSON), to avoid writes on every poll.
- Alternative: store full insight in metadata. Rejected: annotation text is large and is not a contract we want to freeze.

### D6: UI

- `threadPanelAction` with id `pr`, title "PR", `layout: "padded"`.
- `app.composer.customize({ scopes: thread, banners: [...] })`. The banner reads the same RPC. A click calls `useBbNavigate().openThreadPanel({ actionId: "pr" })`.
- Status icons and colors follow bb's own look (the SDK UI components), not OpenForge.

### D7: Dockside integration in a fork

- Fork `MateoCerquetella/bb-plugins`, change only `plugins/dockside`.
- New pure function `parsePrSummary(value): PrSummaryV1 | null` that validates the shape.
- The row component calls `useSdk().threads.getPluginMetadata({ threadId, pluginId: "github-insight" })`. When the result is null, the current `experimental_useSidebarThreadPullRequest` path runs unchanged.
- Refresh: a spike (task 1) decides if a metadata write reaches dockside over realtime. If not, dockside refetches when the row's thread `updatedAt` changes, and at most every 60 seconds for mounted rows.
- Install the fork with `bb plugin install` from its git URL or a local path, instead of the upstream `dockside`.

## Risks / Trade-offs

- [Actions checks often only say "Process completed with exit code 1."] → The link to the check is always shown. The user can ask the agent to read the log with `gh`. Log lines stay out of scope.
- [Many threads with open PRs use GraphQL points] → One refresh per PR (not per thread), max 4 at the same time, 60s interval, and back-off on rate limit. About 2 calls per PR per minute: 20 open PRs cost about 2400 calls per hour, under the 5000 points per hour limit. If this is too high, raise the interval for threads that were not opened for a day.
- [Required checks are not marked] → All checks are shown, also optional ones. Branch protection data needs admin access on many repos. Can be added later as an optional field.
- [The metadata namespace is writable by any plugin or agent] → Dockside validates the shape and shows only counts and names. Nothing in the summary turns on tools or actions.
- [Fork drifts from upstream dockside] → The patch is small and in its own files. Offer it upstream as an optional integration.
- [`experimental_` SDK APIs can change] → Pin `engines.bbPluginSdk` and keep the use of `experimental_` APIs in few files.

## Migration Plan

- New plugin, no data to migrate. Install with `bb plugin install ./plugins/github-insight`.
- Rollback: `bb plugin uninstall github-insight`. Dockside then falls back to core data because the summary is no longer updated. A stale summary stays in metadata; dockside shows it with its `updatedAt`, so the fork also ignores summaries older than 1 hour.

## Open Questions

- Does a thread plugin metadata write trigger a realtime update that dockside rows get? (Spike, task 1. Only changes how dockside refreshes, not the specs.)
