## 1. Spikes

- [x] 1.1 In the "Review" tab, render one file with `FileDiff` from the shimmed `@pierre/diffs/react` and one line annotation with a React button; verify in the running app that the code theme matches bb's diff panel and the button is clickable, and record the result (D4 or fallback) in design.md
- [x] 1.2 Record `gh api --paginate repos/<o>/<r>/pulls/<n>/files` and the review threads GraphQL response for an open PR that has an open thread, a resolved thread, an outdated thread, and a thread with replies; trim them and save them under `plugins/github-insight/test/fixtures/`; verify they parse as JSON and hold those 4 cases

## 2. Pure core

- [x] 2.1 Extract the PR lookup from `getInsight` in `server.ts` into a `resolvePr(threadId)` function used by both features; verify the existing tests still pass with `npm test`
- [x] 2.2 Implement `parsePrFiles` (path, status, patch or null) and verify tests: a normal file, a renamed file, and a file without a patch
- [x] 2.3 Implement `parseReviewThreads` (id, resolved, outdated, path, line, originalLine, side, comments with author, time, body, url, diffHunk) and verify tests on the fixture for all 4 cases
- [x] 2.4 Implement `placeThreads(files, threads)` that splits threads into placed (file, side, line) and outdated; verify tests: RIGHT maps to `additions`, LEFT to `deletions`, `isOutdated`, null line, line outside the hunks, and file not in the PR
- [ ] 2.5 Implement `buildAgentPrompt(threads)` and verify a snapshot test: it holds each thread id, path, line, snippet, and comments, and the three rules (fix code, save draft with the CLI command, do not post or resolve)

## 3. GitHub access (host)

- [ ] 3.1 Add host handlers `fetchPrFiles` and `fetchReviewThreads` (with paging, max 5 pages) to `hostContract` and `host.ts`; verify against a live PR from `bb plugin dev`
- [x] 3.2 Add host handlers `replyToThread` and `setThreadResolved` that pass the body and ids as GraphQL variables, never in the query text; verify a unit test on the built `gh` args with a body that holds quotes and newlines
- [x] 3.3 On a test PR, post a reply while you have a pending review on GitHub; record in design.md (Risks) if the reply goes to the pending review, and if so return a `pending_review` result that the tab shows as "Reply added to your pending review"
- [x] 3.4 Add host handler `readTextFile(path, cwd)` with a 64 KB limit; verify unit tests for a relative path, a missing file, and a file over the limit

## 4. Server RPC and drafts

- [x] 4.1 Implement draft storage in `bb.storage.kv` (key per PR and review thread, value body, updatedAt, source) with get, save, delete, and list-for-PR; verify unit tests with a fake kv
- [ ] 4.2 Implement RPC `getReview({ threadId })`: resolve the PR, fetch files and threads in parallel, place threads, attach drafts, and delete drafts of resolved or missing threads; verify tests with fake host calls: "no PR", gh error, and the fixture result
- [ ] 4.3 Implement RPCs `reply`, `setResolved`, `saveDraft`, and `discardDraft`; "Post + resolve" runs reply then resolve, and a successful post deletes the draft; verify unit tests, also for "resolve fails after reply"
- [ ] 4.4 Publish `review.updated` with the thread id after each draft write or delete and after each GitHub write; verify a unit test with a fake realtime

## 5. Agent flow

- [x] 5.1 Register `defineCli` with `review list` (text and `--json`, unresolved only, draft flag, bodies capped at 4000 characters) and `review draft <thread-id>` (exactly one of `--body` or `--body-file`, id checked against the PR); verify unit tests for no `ctx.threadId`, no PR, unknown id, and a saved draft
- [ ] 5.2 Implement RPC `sendToAgent({ threadId, reviewThreadIds })` with fresh threads, `buildAgentPrompt`, and `bb.sdk.threads.send` in `auto` mode; verify in the running app that an idle thread starts a turn and a busy thread queues it, and record in design.md how the message shows in the chat
- [x] 5.3 Check that no CLI code path imports the GitHub write handlers; verify with a test that runs both CLI commands against a fake host and asserts that `replyToThread` and `setThreadResolved` are never called
- [x] 5.4 Add a short "Review threads" section to the plugin README: the tab, the CLI commands, and the rule that the agent must not post with `gh`; verify `bb github-insight review --help` lists both commands

## 6. Review tab UI

- [ ] 6.1 Register the "Review" `threadPanelAction` (`layout: "flush"`) with header counts ("N open", "N outdated"), "Show resolved" toggle, refresh action, and the "No pull request for this thread" and error-with-retry states; verify with `renderSlot` tests
- [ ] 6.2 Render the file list with one diff per file (D4, or the fallback from spike 1.1), "Diff not available" for files without a patch, and lazy rendering for files out of view; verify with a `renderSlot` test on the fixture
- [x] 6.3 Build the thread component: comments with author, time, and Markdown body; collapsed resolved threads; reply box with "Post" and "Post + resolve"; "Resolve" and "Unresolve"; errors keep the reply text; verify with `renderSlot` tests for each action and for a failed post
- [ ] 6.4 Build the "Outdated" section with path, original line, and the `diffHunk` snippet; verify with a `renderSlot` test on the fixture's outdated thread
- [ ] 6.5 Add the checkboxes and "Send N to agent" (disabled at 0, clears after success, keeps selection on error); verify with `renderSlot` tests
- [ ] 6.6 Show the draft as "Draft from agent" with an editable text, "Post", "Post + resolve", and "Discard"; save edits to the draft (debounced); refetch on `review.updated`; verify with `renderSlot` tests and in the running app that a draft saved from the CLI shows without a refresh

## 7. End-to-end check

- [ ] 7.1 On a thread whose PR has open review threads: select 2 threads, send them to the agent, let the agent fix the code and save 2 drafts with the CLI, edit one draft, post one with "Post + resolve", and discard the other; verify on GitHub that exactly one reply was posted and that thread is resolved, and that nothing else was written
