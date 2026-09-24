## Context

- `github-insight` already finds a thread's PR (thread → environment → `bb.sdk.environments.pullRequest` → `parsePullRequestUrl`) and runs `gh` in a `bb.host` entry on the environment's host (`server.ts`, `host.ts`). The server does all parsing in pure `core/` functions, with tests that use recorded GitHub responses.
- bb's own diff panel can only be replaced as a whole through `experimental_diffRenderer`. That renderer gets no thread id, and the SDK has no API for line decorations or line comments. So the review UI must be a plugin tab.
- The host component `experimental_Diff` renders one patch, but has no way to put content below a line.
- `@pierre/diffs` (the library behind bb's diff view) is shimmed by the host, so a plugin can import `@pierre/diffs/react` without bundling it. Its `FileDiff` accepts `lineAnnotations` (`{ side: "deletions" | "additions", lineNumber }`) and a `renderAnnotation` callback. The SDK docs advise against a direct import, because the plugin then owns patch parsing and the code theme.
- CLI: `defineCli` accepts command keys with spaces (`"review list"`), and `ctx.threadId` tells which bb thread called it.
- `bb.sdk.threads.send({ threadId, mode: "auto", input })` starts a turn, or queues it when the thread is busy.
- `bb.storage.kv` keeps small JSON rows (max 256 KB each) across restarts. `bb.realtime.publish` + `useRealtime` push events to open tabs.
- OpenForge solved the same problem. It showed two useful lessons: the agent must write through a CLI one thread at a time (not as JSON in its final message), and threads that cannot be placed on a line must show in a banner, never be hidden.

## Goals / Non-Goals

**Goals:**
- One GitHub read path (files + threads) for the tab and the CLI.
- Keep GitHub response parsing, thread placement, and the agent prompt in pure functions with tests on recorded responses.
- Keep the host entry narrow: one handler per GitHub call, no general "run any query" handler.

**Non-Goals:**
- Background polling of review threads. The tab loads on open, after writes, and on refresh.
- A shared review UI package for other plugins.
- A local database of threads. GitHub is the source of truth. Only drafts are stored locally.
- Line comments in bb's own diff panel.

## Decisions

### D1: Put the Review tab in `github-insight`

- Reuse the PR lookup and the `gh` host entry. Extract the PR lookup from `getInsight` into one function that both features use.
- The CLI name is the plugin's one top-level command: `bb github-insight`.
- Alternative: a new plugin. Rejected: it duplicates the host entry and the PR lookup, and plugins cannot call each other.

### D2: GitHub reads

```
server                                    host (gh on the environment's host)
+-------------------------------+  call   +-----------------------------------+
| getReview({threadId})         | ------> | fetchPrFiles(owner,repo,n)        |
|  resolvePr(threadId)          |         |   gh api --paginate               |
|  parseFiles, parseThreads     | <------ |   repos/o/r/pulls/n/files         |
|  placeThreads(files, threads) |         | fetchReviewThreads(o,r,n,after)   |
|  attach drafts (kv)           |         |   gh api graphql (reviewThreads)  |
+-------------------------------+         +-----------------------------------+
```

- **Files:** REST `pulls/{n}/files` with `--paginate` (100 per page). It returns a `patch` per file. The patch is missing for binary or very large files. GitHub returns at most 3000 files.
- **Threads:** GraphQL `pullRequest { headRefOid reviewThreads(first: 100, after) { nodes { id isResolved isOutdated path line originalLine diffSide startLine comments(first: 100) { nodes { id author { login } body createdAt url diffHunk } } } } }`. Page threads up to 5 pages.
- Why REST for files: GraphQL `files` has no patch text.
- Both calls run in parallel from the server.

### D3: GitHub writes

- Host handlers, each one GraphQL mutation through `gh api graphql`:
  - `replyToThread(threadId, body)` → `addPullRequestReviewThreadReply`
  - `setThreadResolved(threadId, resolved)` → `resolveReviewThread` / `unresolveReviewThread`
- "Post + resolve" is two calls on the server: reply, then resolve. If the resolve fails, the reply stays posted, and the tab shows the resolve error.
- Only RPC handlers that the tab calls use these host handlers. The CLI registration does not import them. This keeps the "writes only on user action" rule easy to check in review.
- The body is passed as a GraphQL variable (`-F body=@-` from stdin, or `-f body=...`), never put into the query text.

### D4: Render with `@pierre/diffs/react` and line annotations

- The tab renders each file with `FileDiff` from `@pierre/diffs/react`. Each placed thread becomes a line annotation. `renderAnnotation` renders the thread component (comments, draft, reply box, actions).
- Mapping in a pure function `placeThreads`:
  - `diffSide: RIGHT` → `additions`, `LEFT` → `deletions`, `lineNumber = line`.
  - A thread is **outdated** when `isOutdated` is true, or `line` is null, or the line is not in the file's hunks, or the file is not in the PR files. Outdated threads go to the "Outdated" section with `originalLine` and the first comment's `diffHunk`.
- A spike (task 1.1) checks that the shimmed `@pierre/diffs/react` renders with bb's code theme in a plugin tab, and that annotations render React content.
- **Spike result (task 1.1, 2026-09-24): D4 is chosen.** A spike tab showed a `PatchDiff` from the shimmed `@pierre/diffs/react` above bb's `experimental_Diff` with the same patch. In the running app the colors matched, and a React button in a line annotation was clickable. How it works:
  - The tab runs inside the host's `WorkerPoolContext`, so highlighting uses the host's worker pool and its theme. The tab also passes `theme: name` and `themeType: mode` from `experimental_useCodeTheme()`.
  - GitHub REST patches have no file headers, and Pierre needs them. The pure `gitPatch(file)` adds the `diff --git`, mode, rename or copy, and `---`/`+++` lines. `ui/file-diff.tsx` parses the result with `parsePatchFiles` and renders `FileDiff`. A patch that does not parse to exactly one file shows "Diff not available".
  - All `@pierre/diffs` imports are in `ui/file-diff.tsx`. The `renderSlot` tests mock `@pierre/diffs/react` there, because the SDK test harness stubs `experimental_Diff` but not Pierre.
  - The tab uses `layout: "flush"`, which has no host scrolling. The tab owns its scroll area. Each file mounts its diff when it comes near the view (`IntersectionObserver`).
- Alternative (fallback if the spike fails): `experimental_Diff` per file, and below it a list of that file's threads. Each thread shows its `diffHunk` as a small `experimental_Diff`. It is less like GitHub, but it uses only supported SDK parts. The specs hold for both options, except that "below the diff line" becomes "below the file, with the line snippet".
- Alternative: bb's `experimental_diffRenderer`. Rejected: no thread id and exclusive with other renderers.

### D5: Send to agent from the server

- RPC `sendToAgent({ threadId, reviewThreadIds })`. The server loads the threads again (fresh data), builds the message with a pure `buildAgentPrompt`, and calls `bb.sdk.threads.send({ threadId, mode: "auto", input: [text] })`.
- The message lists each thread (id, path, line, snippet, comments) and ends with the rules:
  - address the comments in the code,
  - for each thread, run `bb github-insight review draft <id> --body-file <file>`,
  - do not post to GitHub and do not resolve threads.
- Why the server and not `useComposer` in the tab: `useComposer` is bound to a composer surface. It is not confirmed that it works from a panel tab. The server path works without the composer.
- Alternative: put the text in the composer so the user can edit it first. Can be added later, it does not change the draft flow.

### D6: CLI for the agent

- `defineCli({ name: "github-insight", commands: { "review list": ..., "review draft": ... } })`.
- Both commands use `ctx.threadId`. Without it they fail with a `PluginCliError` that has a hint.
- `review list`: unresolved threads only, with draft flag. Text output by default, `--json` for JSON. Comment bodies are capped at 4000 characters each, so the output stays below the 1 MiB CLI limit.
- `review draft <thread-id>`: exactly one of `--body` or `--body-file` (a `constraints` rule). It checks the id against the PR's threads before it saves, so a typo fails with the unknown id.
- `--body-file` is always read by the host entry (`readTextFile(path)`, relative to `ctx.cwd`, max 64 KB). The agent writes the file in its environment, and that can be a remote host. Reading on the server would work for local hosts only.
- Alternative: `bb.agents.registerTool`. Rejected for now: new tools only work after a new agent session, and the CLI also lets the user test by hand.

### D7: Draft storage

- `bb.storage.kv`, key `draft:<owner>/<repo>#<number>:<reviewThreadId>`, value `{ body, updatedAt, source: "agent" | "user" }`.
- Edits in the tab are saved to the same key (debounced), so an edit survives a tab close.
- When `getReview` sees a draft for a thread that is resolved or gone, it does not return it, and it deletes the row.
- After each draft write or delete, the server publishes the realtime event `review.updated` with `{ threadId }`. The open tab refetches. This is how a draft from the agent shows without a manual refresh.

### D8: Tab state in the app

- `useRpc` for `getReview`, `reply`, `setResolved`, `saveDraft`, `discardDraft`, `sendToAgent`.
- The selection (checkboxes) and "Show resolved" are local React state. They are lost when the tab closes. This is acceptable for v1.

## Risks / Trade-offs

- [Direct `@pierre/diffs` import is not the SDK's advised path, and the theme or patch handling can drift from bb's view] → Spike first (task 1.1). Keep all `@pierre/diffs` use in one component file. Fallback in D4.
- [The user has a pending review on GitHub, and `addPullRequestReviewThreadReply` adds the reply to that pending review instead of posting it] → Test it in task 3.3. If it happens, show "Reply added to your pending review" and link to the PR. Do not try to submit the user's pending review.
  - **Result (task 3.3, 2026-09-25): it happens.** On a test PR with a pending review, the reply came back with `comment.state: PENDING`, in the same review as the pending comment. Nobody else can see it until the user submits that review. When the user deletes the pending review, the reply is deleted with it. `resolveReviewThread` and `unresolveReviewThread` work at once, also with a pending review.
  - The mutation asks for `comment { state }`. For `PENDING`, the `reply` RPC returns the PR url in `pendingReviewUrl`, and the tab shows "Reply added to your pending review." with a link to the PR.
- [Replies show under the user's name, also when the agent wrote the draft] → The user must click "Post". The draft is marked "Draft from agent" until then. The agent prompt tells the agent not to post.
- [The agent can still run `gh` and post directly] → The plugin cannot block that. The prompt rule is the only guard. This is written in the plugin README.
- [Large PRs (many files, big patches) make the tab slow] → Files render lazily as they scroll into view (virtualized list, or collapsed files above 50 files). No hard limit in v1.
- [Many threads and comments exceed one GraphQL page] → Page threads (max 5 pages of 100). Comments per thread are capped at 100. The tab shows "more comments on GitHub" with a link when the cap is hit.
- [The head commit changes while the tab is open] → Each load uses the current head. Drafts are keyed by thread id, not by commit, so they survive a push.

## Migration Plan

- No data to migrate. Update the installed plugin with `bb plugin install ./plugins/github-insight`.
- Rollback: install the previous version. Draft rows stay in kv and are ignored.

## Open Questions

- Does `bb.sdk.threads.send` show the message in the chat as a user message, or as a plugin message? It does not change the flow, only how the message looks. (Check in task 5.2.)
