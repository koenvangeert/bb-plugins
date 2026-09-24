## 1. Spikes

- [ ] 1.1 In a throwaway plugin, write thread plugin metadata from the server and read it in a sidebar component with `useSdk().threads.getPluginMetadata`; record in design.md (D7) if the component gets the change over realtime or needs a refetch
- [ ] 1.2 Record the overview and detail GraphQL responses for `collibra/frontend#25392` with `gh api graphql`, trim them, and save them as test fixtures under `plugins/github-insight/test/fixtures/`; verify they parse as JSON and contain duplicate check names and one failure annotation

## 2. Plugin scaffold

- [ ] 2.1 Run `bb plugin new github-insight` in `plugins/`, set up `server`, `app`, and `host` entries in `package.json`, and verify `bb plugin install ./plugins/github-insight` shows it as running in `bb plugin list`
- [ ] 2.2 Define the host contract (`fetchOverview`, `fetchDetails`) and the RPC contract (`getInsight`, `refresh`) with zod schemas; verify the types compile with `tsc --noEmit`

## 3. Pure core

- [ ] 3.1 Implement `dedupeChecks` and verify tests: re-run after cancel gives one passed `renovate-gate`; status contexts keep the newest by `createdAt`
- [ ] 3.2 Implement `mapCheckStatus` for check runs and status contexts and verify a table test covers every conclusion and state in the `pr-insight-data` spec
- [ ] 3.3 Implement `checkReason` and annotation filtering and verify tests: the empty title/summary case uses the annotation, warnings are dropped, max 5 shown with the total count, and an empty reason keeps the link
- [ ] 3.4 Implement `buildReviewers` and verify tests: pending code owner team, approved user, and a re-requested reviewer that shows as pending
- [ ] 3.5 Implement `buildBlockers` and verify tests: `BLOCKED` + `REVIEW_REQUIRED` gives `review_required` without `blocked`, `BEHIND` gives `behind`, a ready PR gives an empty list, and the order is correct
- [ ] 3.6 Implement `buildSummary` and verify tests: the PR 25392 fixture gives the expected counts and names, the size is under 4 KiB, and no annotation text is included

## 4. GitHub access

- [ ] 4.1 Implement the host entry that runs `gh api graphql` for the overview query with contexts paging (max 5 pages) and for the detail query; verify against the live PR 25392 from `bb plugin dev`
- [ ] 4.2 Map `gh` failures to the errors "gh not installed", "gh not logged in", and "rate limited" (with reset time); verify with unit tests on recorded stderr and exit codes

## 5. Poll service and delivery

- [ ] 5.1 Implement the `pr-poller` background service: list threads, group by environment and PR, 60s interval, max 4 refreshes at once, stop for merged or closed PRs after one last refresh; verify with a unit test using a fake SDK and a fake clock
- [ ] 5.2 Implement rate-limit back-off (reset time or 5 minutes) and keep the last good data with its time on failure; verify with a unit test
- [ ] 5.3 Implement the in-memory cache and the `getInsight` and `refresh` RPC handlers; verify `getInsight` returns "no PR" for a thread without a PR and the full insight for PR 25392
- [ ] 5.4 Publish the `insight.updated` realtime event and write `github-insight.prSummary` only when the summary changed, and remove it when the PR is unlinked; verify with `bb` CLI that the thread's plugin metadata holds the summary

## 6. UI

- [ ] 6.1 Build the "PR" `threadPanelAction`: header, blockers, reviewers, checks grouped and ordered as in the `pr-insight-ui` spec; verify with a `renderSlot` test on the PR 25392 insight
- [ ] 6.2 Add the empty and error states ("No pull request for this thread", error text with retry, time of last good refresh) and the refresh action with progress; verify with `renderSlot` tests
- [ ] 6.3 Build the composer banner: counts and top blocker text, hidden when no PR, merged, closed, or no blockers, click opens the "PR" tab; verify with `renderSlot` tests for each case
- [ ] 6.4 Subscribe the tab and the banner to `insight.updated` and refetch; verify in the running app that a manual refresh in the tab also updates the banner

## 7. Dockside fork

- [ ] 7.1 Fork `MateoCerquetella/bb-plugins`, install the fork's `plugins/dockside` instead of the upstream one, and verify the sidebar looks the same as before
- [ ] 7.2 Add `parsePrSummary` with validation of version 1, field types, and the 1-hour age limit; verify unit tests for valid, missing, wrong version, wrong types, and old summaries
- [ ] 7.3 Show failed, running, and pending review counts with a tooltip on the row, a stale mark when `error` is set, and no counts for merged or closed PRs; fall back to the core hook when there is no valid summary; verify with component tests and in the running app with `github-insight` on and off
- [ ] 7.4 Refresh rows as decided in spike 1.1; verify that a new failed check shows on the row within 2 poll intervals

## 8. End-to-end check

- [ ] 8.1 On a thread with PR 25392 (or another open PR with a failed check and a pending code owner review), verify the tab, the banner, and the dockside row all show the same failed check and the same pending reviewer
- [ ] 8.2 Uninstall `github-insight` and verify dockside falls back to core PR data after the summary is 1 hour old, and the banner and tab are gone
