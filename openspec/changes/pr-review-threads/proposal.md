## Why

When reviewers comment on the PR of a bb thread, you must go to GitHub to read the comments, reply, and resolve them. Then you copy the comments into the chat so that the agent can fix the code. bb and the agent do not see the review threads, so this loop is slow and manual.

## What Changes

- New "Review" tab in the `github-insight` plugin, next to the "PR" tab. It shows the PR diff from GitHub, with the review threads on their lines, like the "Files changed" page on GitHub.
- The first release is for **author mode** only: the PR of the thread is your own PR, and the review threads come from other people.
- In each thread you can:
  - read all comments,
  - write and post a reply,
  - resolve and unresolve the thread,
  - select the thread for the agent.
- "Send to agent" puts the selected threads into the thread's chat as one message. The agent works in the main chat, with its full context.
- The agent does not post to GitHub. It saves a **draft reply** for a thread with a new CLI command. The draft shows in the tab. You edit, post, or discard it.
- Threads whose line is no longer in the diff show in an "Outdated" section. They are never hidden.

Out of scope for this change:
- Reviewer mode (review a PR of another person, approve, request changes).
- New line comments from you that do not reply to a thread.
- GitHub suggestion blocks.
- Top-level PR comments and review summary text.
- The local diff of the worktree (self-review).
- Changes to bb's own diff panel.

## Capabilities

### New Capabilities

- `pr-review-threads`: getting the PR diff and review threads from GitHub, the "Review" tab, and reply and resolve actions.
- `pr-review-agent-drafts`: sending threads to the thread's agent, the agent CLI to list threads and save drafts, and how you post or discard a draft.

### Modified Capabilities

None. The project has no archived specs yet. The in-flight `github-pr-insight` change stays as it is.

## Impact

- Code in `plugins/github-insight/`: new host calls, new RPC calls, a new tab, a CLI command `bb github-insight review ...`, and plugin storage for drafts.
- Needs the `gh` CLI with a logged-in user on each host, as `github-insight` does now.
- New GitHub API calls through `gh`:
  - reads: PR files (REST) and review threads (GraphQL),
  - writes: thread reply, resolve, unresolve (GraphQL). Writes happen only when you click.
- Replies are posted as the `gh` user, because `gh` uses your login.
- No change to bb core.
