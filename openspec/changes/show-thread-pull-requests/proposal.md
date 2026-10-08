## Why

The Jira page shows the threads that are linked to each ticket, but not their pull requests. To see if a ticket has a PR, and if it is open or merged, I must open each thread.

## What Changes

- Each thread chip on a ticket row shows the pull request of that thread's branch, when it has one.
- The PR pill shows the PR number and its state: open, draft, merged, or closed. Each state has its own colour.
- A click on the PR pill opens the PR in the browser.
- A thread with no PR, or a PR that BB cannot read, shows no pill and no error.
- Out of scope: PR attention signals (checks, reviews, conflicts), and the PR in the thread header.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `jira-ticket-list`: each linked thread on a ticket row also shows its pull request.

## Impact

- `plugins/jira/src/ui/TicketsPage.tsx`: the thread chip gets a PR pill.
- Uses the experimental BB SDK hook `experimental_useSidebarThreadPullRequest`. No server, RPC, or database change.
- One git-host lookup for each linked thread environment. BB owns the polling and the cache.
