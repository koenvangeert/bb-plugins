## Purpose

Lets the user hand review threads to the thread's agent, and lets the agent save draft replies that the user checks before anything is posted to GitHub.

## ADDED Requirements

### Requirement: Select threads for the agent
Each unresolved thread in the "Review" tab SHALL have a checkbox. The tab SHALL show a "Send N to agent" action, where N is the number of selected threads. The action SHALL be disabled when N is 0.

#### Scenario: Select two threads
- **WHEN** the user selects 2 threads
- **THEN** the tab shows "Send 2 to agent"

### Requirement: Send threads to the agent
When the user clicks "Send N to agent", the plugin SHALL send one message to the thread's chat. The message SHALL contain, for each selected thread: the thread id, the file path, the line, the code snippet, and all comments with author and text. The message SHALL tell the agent to address the comments in the code and to save a draft reply for each thread with the plugin's CLI. The message SHALL tell the agent not to post to GitHub. When the thread's agent is busy, the message SHALL be queued. After a successful send, the tab SHALL clear the selection.

#### Scenario: Send to an idle agent
- **WHEN** the agent is idle and the user sends 2 threads
- **THEN** a new turn starts in the thread's chat with one message that holds both threads

#### Scenario: Send to a busy agent
- **WHEN** the agent is running a turn and the user sends 1 thread
- **THEN** the message is queued for the thread

#### Scenario: Send fails
- **WHEN** the send fails
- **THEN** the tab shows the error and keeps the selection

### Requirement: Agent lists review threads
The plugin SHALL provide a CLI command `bb github-insight review list` that prints the unresolved review threads of the calling thread's PR. For each thread it SHALL print the thread id, the path, the line, whether it is outdated, the comments, and whether a draft exists. With `--json`, the output SHALL be JSON. When the command does not run in a bb thread, or the thread has no PR, it SHALL exit with a non-zero code and a clear error.

#### Scenario: List threads
- **WHEN** the agent runs `bb github-insight review list --json` in a thread with a PR that has 2 unresolved threads
- **THEN** the output is JSON with the 2 threads

#### Scenario: No PR
- **WHEN** the agent runs the command in a thread without a PR
- **THEN** the command exits with a non-zero code and the error "No pull request for this thread"

### Requirement: Agent saves a draft reply
The plugin SHALL provide a CLI command `bb github-insight review draft <thread-id>` that saves a draft reply for a review thread of the calling thread's PR. The text SHALL come from `--body <text>` or from `--body-file <path>`. A new draft for the same thread SHALL replace the old one. The command SHALL NOT write to GitHub. When the thread id is not a review thread of the PR, the command SHALL exit with a non-zero code and a clear error.

#### Scenario: Save a draft
- **WHEN** the agent runs `bb github-insight review draft PRRT_abc --body "Renamed in abc123"`
- **THEN** the draft is saved for thread `PRRT_abc`
- **AND** nothing is written to GitHub

#### Scenario: Unknown thread
- **WHEN** the agent runs the command with a thread id that is not in the PR
- **THEN** the command exits with a non-zero code and the error names the unknown id

### Requirement: Draft in the tab
When a thread has a draft, the tab SHALL show the draft below the thread's comments, marked as "Draft from agent". The draft SHALL show in the tab without a manual refresh while the tab is open. The user SHALL be able to edit the draft text, "Post" it, "Post + resolve" it, or "Discard" it. After a successful post, the plugin SHALL delete the draft. "Discard" SHALL delete the draft without writing to GitHub.

#### Scenario: Draft shows while the tab is open
- **WHEN** the tab is open and the agent saves a draft for a thread
- **THEN** the draft shows in that thread without a refresh

#### Scenario: Edit and post a draft
- **WHEN** the user edits the draft text and clicks "Post"
- **THEN** the edited text is posted as a reply on GitHub
- **AND** the draft is deleted

#### Scenario: Discard a draft
- **WHEN** the user clicks "Discard"
- **THEN** the draft is deleted
- **AND** nothing is written to GitHub

### Requirement: Draft lifetime
Drafts SHALL be kept across plugin and bb restarts. A draft for a thread that is resolved or no longer exists SHALL NOT show in the tab.

#### Scenario: Restart
- **WHEN** bb restarts after the agent saved a draft
- **THEN** the draft still shows in the tab

#### Scenario: Thread resolved on GitHub
- **WHEN** a thread with a draft is resolved on GitHub
- **THEN** the tab does not show the draft
