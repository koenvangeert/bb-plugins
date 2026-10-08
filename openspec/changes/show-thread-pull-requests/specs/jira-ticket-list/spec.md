## ADDED Requirements

### Requirement: Pull request per linked thread
Each linked thread on a ticket row SHALL show the pull request of the thread's branch, when it has one. The PR SHALL show its number and its state (open, draft, merged, or closed), and SHALL open in the browser when the user clicks it.

#### Scenario: Thread with an open PR
- **WHEN** a thread linked to `ABC-12` has open PR #412
- **THEN** the `ABC-12` row shows `#412` next to that thread, styled as open

#### Scenario: PR states
- **WHEN** the thread's PR is draft, merged, or closed
- **THEN** the PR shows that state, and each state looks different from the others

#### Scenario: Open the PR
- **WHEN** the user clicks the PR next to a thread
- **THEN** the PR opens in the browser, and the thread does not open

#### Scenario: Thread with no PR
- **WHEN** a linked thread's branch has no PR, the thread has no environment, or BB cannot read the PR
- **THEN** the row shows the thread with no PR and no error
