## Why

bb shows "Checks failing" on a thread's PR, but not which checks fail, why they fail, who must review, or what blocks the merge. To find out, you must open GitHub. OpenForge shows check names and reviewers, but it also does not show why a check failed.

## What Changes

- New bb plugin `github-insight` in this repo.
- It reads the PR of a thread through the `gh` CLI on the thread's host. It does not need a new token.
- It shows, per PR:
  - Checks: name, status, and the reason for a failure (check summary and annotations), with a link to the check on GitHub.
  - Reviewers: users and teams, their review state, and if they are code owners.
  - Merge blockers: branch out of date, review required, changes requested, merge conflict, unresolved review threads, failing checks.
- A tab in the thread's right panel with the full detail.
- A one-line banner above the composer. A click opens the tab.
- It polls open PRs in the background and has a manual refresh.
- It writes a small, versioned PR summary into the thread's plugin metadata, so that other plugins can read it.
- A small patch in a fork of the `dockside` plugin reads that summary and shows it on the sidebar row. Without `github-insight`, dockside works as before.

Out of scope for this change:
- Log lines of failed jobs. The agent can get them with `gh` when you ask.
- A "send failure to agent" button.
- Actions on the PR (merge, update branch, re-run checks).

## Capabilities

### New Capabilities

- `pr-insight-data`: getting PR checks, reviewers, and merge blockers for a thread from GitHub, and the refresh behavior.
- `pr-insight-ui`: the right panel tab and the composer banner.
- `pr-insight-summary-contract`: the versioned summary in thread plugin metadata that other plugins can read.
- `dockside-pr-insight`: how the forked dockside sidebar row shows the summary.

### Modified Capabilities

None. The project has no specs yet.

## Impact

- New plugin folder in this repo (`plugins/github-insight/`), built on the bb Plugin SDK (server, app, and host entries).
- Needs the `gh` CLI with a logged-in user on each host that runs threads.
- Adds GitHub API calls through `gh`: one GraphQL call per open PR per poll.
- The dockside fork is a separate repo. The patch there is a task in this change, but its code does not live here.
- No change to bb core. The core PR pill stays as it is.
