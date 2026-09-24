## Purpose

Shows the PR insight data of a thread in bb: full detail in a right panel tab, and a one-line summary above the composer.

## ADDED Requirements

### Requirement: PR tab in the thread's right panel
The plugin SHALL add a "PR" tab to the thread's right panel. The tab SHALL show, in this order: the PR header, the merge blockers, the reviewers, and the checks.

#### Scenario: Open the tab on a thread with a PR
- **WHEN** the user opens the "PR" tab on a thread with an open PR
- **THEN** the tab shows the PR number, title, state, and a link to the PR on GitHub
- **AND** it shows the merge blockers, the reviewers, and the checks

### Requirement: Checks in the tab
The tab SHALL group checks by status in this order: failed, cancelled, running, passed, skipped. The failed and cancelled groups SHALL be open. The passed and skipped groups SHALL be collapsed and show only their count. Each failed or cancelled check SHALL show its name, reason, annotations (file:line and message), and a link that opens the check on GitHub. When a check has more failure annotations than are shown, the tab SHALL show how many more there are.

#### Scenario: Failed check detail
- **WHEN** check `snyk-scan / comment-findings` failed with reason "Process completed with exit code 1."
- **THEN** the failed group shows `snyk-scan / comment-findings`, that reason, and a link to the check on GitHub

#### Scenario: Passed checks collapsed
- **WHEN** 50 checks passed
- **THEN** the tab shows one collapsed row "50 passed"
- **AND** the user can expand it to see the names

### Requirement: Reviewers in the tab
The tab SHALL list each reviewer with name, a "(team)" suffix for teams, a state label, and a "code owner" label when the reviewer is a code owner.

#### Scenario: Pending code owner team
- **WHEN** team `ai-governance` is a pending code owner reviewer
- **THEN** the tab shows "ai-governance (team)", the label "Pending", and the label "code owner"

### Requirement: Tab states without data
The tab SHALL show a clear message when it has no data to show: "No pull request for this thread" when bb links no PR, and the error text with a retry action when the data cannot be read. When the data is older than the last refresh attempt, the tab SHALL show the time of the last good refresh.

#### Scenario: No PR
- **WHEN** the user opens the "PR" tab on a thread without a PR
- **THEN** the tab shows "No pull request for this thread"

#### Scenario: gh not logged in
- **WHEN** the data cannot be read because `gh` is not logged in
- **THEN** the tab shows "gh not logged in" and a retry action

### Requirement: Manual refresh in the tab
The tab SHALL have a refresh action that starts a manual refresh for the thread and shows that the refresh is in progress.

#### Scenario: User refreshes
- **WHEN** the user clicks refresh in the tab
- **THEN** the tab shows a progress state
- **AND** it shows the new data when the refresh is done

### Requirement: Composer banner
The plugin SHALL show a one-line banner above the thread's composer when the thread's open PR has at least one merge blocker. The banner SHALL show the number of failed checks, the number of running checks, the number of pending reviewers, and the text of the most important other blocker, and SHALL leave out parts that are zero or empty. A click on the banner SHALL open the "PR" tab. The banner SHALL NOT show when the thread has no PR, when the PR is merged or closed, or when the PR has no merge blockers.

#### Scenario: Failed checks and pending review
- **WHEN** the thread's PR has 2 failed checks, 1 pending reviewer, and is out of date
- **THEN** the banner shows "2 checks failed", "1 review pending", and "Branch out of date"

#### Scenario: Click opens the tab
- **WHEN** the user clicks the banner
- **THEN** the "PR" tab opens in the thread's right panel

#### Scenario: Ready to merge
- **WHEN** the thread's PR has no merge blockers
- **THEN** no banner shows
