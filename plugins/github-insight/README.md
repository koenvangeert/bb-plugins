# bb-plugin-github-insight

Shows the merge blockers, reviewers, and checks of a thread's pull request in a **PR** tab in the thread's right panel. A **Review** tab shows the PR's diff from GitHub.

## How it works

```
app (PR tab) --getInsight/refresh--> server --fetchOverviewPage--> host (gh api graphql)
      ^                                 |
      +------ insight.updated ----------+  (pr-poller, every 60s)
```

- `pr-lookup.ts`: finds the thread's PR through `bb.sdk.environments.pullRequest`. Both tabs use it. No PR means no GitHub call.
- `server.ts`: asks the thread's host for the PR data. `getReview` reads the PR files on each call, without a cache.
- `refresh/insight-service.ts`: keeps the last insight per PR in memory. The `pr-poller` service refreshes each open PR every 60 seconds, one refresh per PR, max 4 at once. A merged or closed PR gets one last refresh. After a rate limit, it waits until the reset time or 5 minutes. After a refresh that changes the data, it publishes `insight.updated` with the thread ids.
- `host.ts`: runs `gh api graphql`, and `gh api --paginate --slurp` for the PR files, with the `gh` login of the host. It returns the raw JSON, or a failure: `gh_missing`, `gh_logged_out`, `rate_limited` (with the reset time from `gh api rate_limit`), or `failed`.
- `core/`: pure parsing. One entry per check name (newest run), mapped to `failed`, `running`, `cancelled`, `passed`, or `skipped`. `buildReviewers` puts open requests (pending) before latest reviews. `buildBlockers` gives the blockers in fixed order, and `blocked` only when no other code applies.
- `ui/pr-tab.tsx`: the PR header with a refresh button, the merge blockers, the reviewers, and the checks, grouped by status. Passed and skipped are collapsed. A failed refresh shows the error with a retry button, and keeps the last good data with its time.
- `ui/review-tab.tsx`: the file count, a refresh button, and one diff per file at the PR head. `ui/file-diff.tsx` is the only file that imports `@pierre/diffs` (see design D4 of the `pr-review-threads` change). A file without a patch shows "Diff not available".

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
