## Context

The ticket rows in `TicketsPage.tsx` show one chip for each linked thread. The server returns only `threadId`, `title`, and `archived` for each thread. BB SDK 0.5.9 has a client hook, `experimental_useSidebarThreadPullRequest(threadId)`, that returns `{ isLoading, pullRequest }`. `pullRequest` is `{ number, title, url, state, attention }` or `null`.

## Goals / Non-Goals

**Goals:**
- Show the PR on the page with no server change.

**Non-Goals:**
- Show `attention` (checks, reviews, conflicts).
- Show the PR in the thread header.

## Decisions

- **Use the client hook, not a server lookup.** The hook reads BB's own PR cache and polling. A server lookup would need `gh` or a git-host token and our own refresh. Alternative: add the PR to the `tickets` RPC. Rejected: more code, and it duplicates what BB already does.
- **One `ThreadChip` component for each thread.** React hooks cannot run in a loop, so each chip calls the hook itself. The chip keeps the current thread button and adds the PR pill next to it.
- **The PR pill is a separate button.** A nested button in the thread button is not valid HTML. A click on the pill calls `navigate.openUrl(pullRequest.url)`.
- **`null` and `isLoading` show nothing.** This follows the SDK docs: `null` means "nothing to show", not an error. This prevents layout jumps and false error messages.
- **State colours** use the same pill style as the ticket status pill: open is green, draft is grey, merged is purple, closed is red.

## Risks / Trade-offs

- [The hook is `experimental_` and has "sidebar" in its name. It may not work on a nav panel page.] -> Task 1 is a spike that checks it on the Jira page before the rest is built. If it fails, stop and come back to this design.
- [The experimental API can change in a later SDK version.] -> The hook is used in one component, so a change has a small impact.
- [Each linked thread causes one git-host lookup.] -> BB shares one lookup across threads in the same environment. Tickets have few threads.
