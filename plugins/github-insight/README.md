# bb-plugin-github-insight

Shows the merge blockers, reviewers, and checks of a thread's pull request in a **PR** tab in the thread's right panel.

## How it works

```
app (PR tab) --getInsight--> server --fetchOverviewPage--> host (gh api graphql)
```

- `server.ts`: finds the thread's PR through `bb.sdk.environments.pullRequest` and asks the thread's host for it. No PR means no GitHub call.
- `host.ts`: runs `gh api graphql` with the `gh` login of the host. It returns the raw JSON.
- `core/`: pure parsing. One entry per check name (newest run), mapped to `failed`, `running`, `cancelled`, `passed`, or `skipped`. `buildReviewers` puts open requests (pending) before latest reviews. `buildBlockers` gives the blockers in fixed order, and `blocked` only when no other code applies.
- `ui/pr-tab.tsx`: the PR header, the merge blockers, the reviewers, and the checks, grouped by status. Passed and skipped are collapsed.

## Requirements

- `gh` installed and logged in on each host that runs threads.

## Develop

```bash
npm install --include=dev
npm test
npm run typecheck
bb plugin install .
bb plugin dev
```

## Test fixtures

`test/fixtures/pr-25337-overview-page-*.json` are the two pages of the overview query for `collibra/frontend#25337`, recorded with `gh api graphql`. `test/fixtures/pr-25337-check-run-details.json` is the detail query for its newest failed and cancelled check runs. Re-record with the queries in `github/`.
