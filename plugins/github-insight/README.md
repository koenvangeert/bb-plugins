# bb-plugin-github-insight

Shows the merge blockers, reviewers, and checks of a thread's pull request in a **PR** tab in the thread's right panel. A **Review** tab shows the PR's diff from GitHub, with the review threads on their lines.

## How it works

```
app (PR tab) --getInsight/refresh--> server --fetchOverviewPage--> host (gh api graphql)
      ^                                 |
      +------ insight.updated ----------+  (pr-poller, every 60s)
```

- `pr-lookup.ts`: finds the thread's PR through `bb.sdk.environments.pullRequest`. Both tabs use it. No PR means no GitHub call.
- `server.ts`: asks the thread's host for the PR data.
- `review/review-service.ts`: reads the PR files and review threads (max 5 pages of 100) in parallel on each load, without a cache, and attaches the drafts. The Review tab and the CLI both use it.
- `review/review-cli.ts`: the `bb github-insight review` commands (see "Review threads").
- `refresh/insight-service.ts`: keeps the last insight per PR in memory. The `pr-poller` service refreshes each open PR every 60 seconds, one refresh per PR, max 4 at once. A merged or closed PR gets one last refresh. After a rate limit, it waits until the reset time or 5 minutes. After a refresh that changes the data, it publishes `insight.updated` with the thread ids.
- `host.ts`: reads a `--body-file` (`readTextFile`), and runs `gh api graphql`, and `gh api --paginate --slurp` for the PR files, with the `gh` login of the host. It returns the raw JSON, or a failure: `gh_missing`, `gh_logged_out`, `rate_limited` (with the reset time from `gh api rate_limit`), or `failed`.
- `core/`: pure parsing. One entry per check name (newest run), mapped to `failed`, `running`, `cancelled`, `passed`, or `skipped`. `buildReviewers` puts open requests (pending) before latest reviews. `buildBlockers` gives the blockers in fixed order, and `blocked` only when no other code applies.
- `ui/pr-tab.tsx`: the PR header with a refresh button, the merge blockers, the reviewers, and the checks, grouped by status. Passed and skipped are collapsed. A failed refresh shows the error with a retry button, and keeps the last good data with its time.
- `ui/review-tab.tsx`: the file count, a refresh button, and one diff per file at the PR head. `ui/file-diff.tsx` is the only file that imports `@pierre/diffs` (see design D4 of the `pr-review-threads` change). A file without a patch shows "Diff not available". `placeThreads` puts each thread on its line (RIGHT on the new side, LEFT on the old side). A thread that is outdated, has no line, or whose line or file is not in the diff goes to the "Outdated" section at the top. Resolved threads show only with "Show resolved", collapsed.

## Review threads

The agent of a thread can read the review threads of the thread's PR and save a draft reply for each one:

```bash
bb github-insight review list [--json]
bb github-insight review draft <thread-id> --body <text>
bb github-insight review draft <thread-id> --body-file <path>
```

- `review list` prints the unresolved threads: id, path, line, `[outdated]`, `[draft]`, and the comments. A comment body is cut at 4000 characters.
- `review draft` saves the text as a draft for one unresolved thread. A new draft replaces the old one. An unknown or resolved thread id fails.
- `--body-file` is read on the thread's host, relative to the agent's working directory. It must be a regular file of max 64 KB.
- Drafts are kept in plugin kv storage, one row per PR and thread (`review/draft-store.ts`). They stay after a bb restart. The draft of a resolved or deleted thread is deleted on the next load. When the PR has more than 5 pages of threads, a draft of a thread that was not read is kept, but not shown.
- The Review tab shows a draft below its thread as "Draft from agent". It updates when the agent saves a draft (realtime event `review.updated`).
- Both commands only read from GitHub. A draft is never posted to GitHub by the CLI.

**Rule for the agent: never post or resolve with `gh`.** The plugin cannot block `gh`. Only the user posts a reply, from the Review tab.

## Requirements

- `gh` 2.48 or later (for `--slurp`), installed and logged in on each host that runs threads.

## Develop

```bash
npm install --include=dev
npm test
npm run typecheck
bb plugin install .
bb plugin dev
```

## Test fixtures

`test/fixtures/pr-25337-overview-page-*.json` are the two pages of the overview query for `collibra/frontend#25337`, recorded with `gh api graphql`. `test/fixtures/pr-25337-check-run-details.json` is the detail query for its newest failed and cancelled check runs. `test/fixtures/pr-1-files.json` is 3 files of `koenvangeert/bb-plugins#1` from `gh api --paginate --slurp repos/koenvangeert/bb-plugins/pulls/1/files`. `package-lock.json` has no patch. Re-record with the queries in `github/`.
