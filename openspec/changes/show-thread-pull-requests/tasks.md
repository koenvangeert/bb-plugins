## 1. Spike

- [x] 1.1 Call `experimental_useSidebarThreadPullRequest` from a thread chip on the Jira page and confirm in the running app that a thread with a PR returns it. If it does not, stop and update design.md.

## 2. PR pill on thread chips

- [x] 2.1 Extract a `ThreadChip` component from the thread list in `TicketsPage.tsx` and verify the current `app.test.tsx` thread tests still pass.
- [x] 2.2 Add the PR pill (number, state colour, opens the PR URL) to `ThreadChip`, with `app.test.tsx` tests for open, draft, merged, closed, no PR, and "click opens the PR, not the thread" (use `sidebarPullRequests` in `renderSlot`).
- [x] 2.3 Update `plugins/jira/README.md` to say that thread chips show their PR, and verify the text matches the app.

## 3. Check

- [x] 3.1 Run the plugin's test, typecheck, and build scripts, and check a ticket with a PR thread in the running app.
