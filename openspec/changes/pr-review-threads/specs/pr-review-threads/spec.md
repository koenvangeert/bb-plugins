## Purpose

Shows the diff and the review threads of a thread's pull request in bb, and lets the user reply to and resolve those threads without going to GitHub.

## ADDED Requirements

### Requirement: Review tab in the thread's right panel
The plugin SHALL add a "Review" tab to the thread's right panel. The tab SHALL show the files of the thread's PR as diffs from GitHub, at the PR's head commit. Each file SHALL show its path and its diff. Files SHALL be in the order that GitHub returns them.

#### Scenario: Open the tab on a thread with a PR
- **WHEN** the user opens the "Review" tab on a thread with an open PR that changes 3 files
- **THEN** the tab shows the 3 files with their paths and diffs

#### Scenario: No PR
- **WHEN** the user opens the "Review" tab on a thread without a PR
- **THEN** the tab shows "No pull request for this thread"

#### Scenario: gh not logged in
- **WHEN** the data cannot be read because `gh` is not logged in
- **THEN** the tab shows "gh not logged in" and a retry action

#### Scenario: File without a patch
- **WHEN** GitHub returns a file without a patch (binary or too large)
- **THEN** the tab shows the file path and the text "Diff not available"

### Requirement: Review threads on their lines
The tab SHALL show each review thread of the PR below the diff line that GitHub anchors it to, on the correct side (old or new). A thread SHALL show all its comments in order, each with author, time, and the comment text rendered as Markdown.

#### Scenario: Thread on a new line
- **WHEN** a reviewer commented on line 42 of the new version of `src/a.ts`
- **THEN** the thread shows below new line 42 in the diff of `src/a.ts`

#### Scenario: Thread with replies
- **WHEN** a thread has a comment and 2 replies
- **THEN** the tab shows the 3 comments in time order, with author and time

### Requirement: Outdated and orphaned threads
A thread that GitHub marks outdated, or whose line is not in the shown diff, SHALL show in an "Outdated" section at the top of the tab. Each such thread SHALL show its file path, its original line, and the code snippet that GitHub stores with the first comment. The tab SHALL NOT hide these threads.

#### Scenario: Line changed after the comment
- **WHEN** a reviewer commented on a line that a later commit changed
- **THEN** the thread shows in the "Outdated" section with its path, original line, and snippet

### Requirement: Resolved threads
Resolved threads SHALL be collapsed to one line that shows the author of the first comment and the text "Resolved". The tab SHALL have a "Show resolved" toggle that is off by default. When the toggle is off, resolved threads SHALL NOT show.

#### Scenario: Resolved thread hidden
- **WHEN** a thread is resolved and "Show resolved" is off
- **THEN** the thread does not show

#### Scenario: Show resolved
- **WHEN** the user turns on "Show resolved"
- **THEN** resolved threads show collapsed, and the user can expand them

### Requirement: Thread counts
The top of the tab SHALL show the number of open threads and the number of outdated open threads.

#### Scenario: Counts
- **WHEN** the PR has 5 open threads, 1 of them outdated, and 2 resolved threads
- **THEN** the tab shows "5 open" and "1 outdated"

### Requirement: Reply to a thread
Each unresolved thread SHALL have a reply box. When the user clicks "Post", the plugin SHALL post the text as a reply to that thread on GitHub and then show the new comment in the thread. When the user clicks "Post + resolve", the plugin SHALL post the reply and then resolve the thread. When posting fails, the tab SHALL show the error and keep the text in the reply box.

#### Scenario: Post a reply
- **WHEN** the user types "Fixed in abc123" and clicks "Post"
- **THEN** GitHub has a new reply "Fixed in abc123" in that thread
- **AND** the tab shows the reply in the thread

#### Scenario: Post fails
- **WHEN** posting a reply fails
- **THEN** the tab shows the error
- **AND** the reply box still holds the text

### Requirement: Resolve and unresolve
Each unresolved thread SHALL have a "Resolve" action. Each resolved thread SHALL have an "Unresolve" action. The plugin SHALL change the thread state on GitHub and then show the new state.

#### Scenario: Resolve a thread
- **WHEN** the user clicks "Resolve" on an open thread
- **THEN** the thread is resolved on GitHub
- **AND** the tab shows it as resolved

### Requirement: Writes only on user action
The plugin SHALL write to GitHub only when the user clicks "Post", "Post + resolve", "Resolve", or "Unresolve" in the tab. No background task, CLI command, or agent action of this plugin SHALL write to GitHub.

#### Scenario: Agent saves a draft
- **WHEN** the agent saves a draft reply for a thread
- **THEN** nothing is written to GitHub

### Requirement: Refresh
The tab SHALL load the data when it opens and after each write. The tab SHALL have a refresh action that loads the data again and shows that the load is in progress.

#### Scenario: New comment on GitHub
- **WHEN** a reviewer adds a comment on GitHub and the user clicks refresh
- **THEN** the tab shows the new comment
