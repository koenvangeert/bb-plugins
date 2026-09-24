See the checks of a thread's pull request without leaving bb.

- A **PR** tab in the thread's right panel.
- The PR number, title, state, and a link to GitHub.
- Merge blockers, most important first: conflicts, failed checks, changes requested, branch out of date, review required, unresolved threads, running checks, draft, blocked.
- Reviewers with their state, "(team)" for teams, and a "code owner" label. An open review request shows as pending, also after an earlier review.
- Every check on the head commit, one entry per check name, grouped by status.
- Failed and cancelled checks show why: a reason and up to 5 failure annotations.
- Updates by itself every 60 seconds while the PR is open. A refresh button updates it at once.
- Errors show as "gh not installed", "gh not logged in", or "rate limited", with a retry button. The last good data stays visible with its time.

- A **Review** tab with the diff of each changed file at the PR head. Files without a patch show "Diff not available".

The plugin uses the `gh` CLI login of the host that runs the thread. It needs no token of its own.
