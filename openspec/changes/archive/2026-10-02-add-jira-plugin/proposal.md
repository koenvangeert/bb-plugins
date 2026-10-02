## Why

I track my Jira tickets in Jira and my agent work in BB, and nothing connects the two. I cannot see which threads work on which ticket, and I start each thread by hand with text copied from Jira.

## What Changes

- Add a BB plugin at `plugins/jira/`.
- The plugin reads Jira through the Atlassian CLI (`acli`) on the BB server host. It uses the `acli` login. It stores no Jira credentials.
- A sidebar page `Jira` shows the tickets assigned to me that are not done: key, summary, status, and the threads linked to each ticket.
- A background job refreshes the ticket list on an interval. A Refresh button refreshes it now.
- "Start thread" on a ticket opens a dialog: pick a BB project, edit the first prompt, and start a thread that is linked to the ticket.
- The thread header shows the linked ticket (key and status) and opens it in Jira.
- On a thread with no ticket, the thread header shows "Link Jira". It links a ticket from my list or a typed key. A linked thread can be unlinked.
- Plugin settings: the JQL query and the refresh interval.
- When `acli` is missing or not logged in, the plugin shows what to do.
- Out of scope: auto-link from branch names, Jira project to BB project mapping, and any write to Jira (transitions, comments).

## Capabilities

### New Capabilities

- `jira-ticket-list`: reading my Jira tickets through `acli`, refreshing them, the sidebar page, and the `acli` health state.
- `jira-thread-link`: linking a thread to one Jira ticket, starting a linked thread from a ticket, and showing the link in the thread header.

### Modified Capabilities

None.

## Impact

- New package `plugins/jira/` with backend and frontend bundles.
- Runtime dependency: `acli` on `PATH` on the BB server host, logged in to Jira.
- Writes thread plugin metadata (`issueKey`) on BB threads. Spawns BB threads on request. Writes only to the plugin's own storage otherwise.
