## Purpose

Gets the checks, reviewers, and merge blockers of the pull request that belongs to a bb thread, and keeps this data current while the PR is open.

## ADDED Requirements

### Requirement: PR resolution per thread
The plugin SHALL use the pull request that bb links to the thread's environment. When bb links no pull request to the thread, the plugin SHALL report "no PR" and SHALL NOT call GitHub for that thread.

#### Scenario: Thread with a PR
- **WHEN** bb links PR `collibra/frontend#25392` to the thread's environment
- **THEN** the plugin gets the insight data for `collibra/frontend#25392`

#### Scenario: Thread without a PR
- **WHEN** bb links no pull request to the thread's environment
- **THEN** the plugin reports "no PR" for the thread
- **AND** it makes no GitHub call for the thread

### Requirement: GitHub access through the gh CLI
The plugin SHALL get GitHub data through the `gh` CLI of the host that runs the thread, with the login of that `gh` CLI. The plugin SHALL NOT ask for, store, or send a GitHub token of its own.

#### Scenario: gh is logged in
- **WHEN** `gh` on the thread's host is installed and logged in
- **THEN** the plugin gets the PR data with that login

#### Scenario: gh is missing or not logged in
- **WHEN** `gh` on the thread's host is not installed or not logged in
- **THEN** the plugin reports an error that names the cause ("gh not installed" or "gh not logged in")
- **AND** it does not retry until the next poll

### Requirement: Latest run per check
The plugin SHALL show one entry per check name. When GitHub has more than one run for the same check name on the head commit, the plugin SHALL use only the newest run.

#### Scenario: Check re-run after a cancel
- **WHEN** check `renovate-gate` has a cancelled run and a newer successful run on the head commit
- **THEN** the plugin shows `renovate-gate` one time, as passed

### Requirement: Check status
The plugin SHALL give each check exactly one status: `failed`, `running`, `cancelled`, `passed`, or `skipped`. It SHALL map both check runs and commit status contexts to these statuses. Conclusions `failure`, `timed_out`, `action_required`, `startup_failure`, and status `error` or `failure` SHALL map to `failed`. Checks that are queued, in progress, waiting, or pending SHALL map to `running`. `cancelled` and `stale` SHALL map to `cancelled`. `success` SHALL map to `passed`. `skipped` and `neutral` SHALL map to `skipped`.

#### Scenario: Failed check run
- **WHEN** check run `snyk-scan / comment-findings` has conclusion `failure`
- **THEN** its status is `failed`

#### Scenario: Pending status context
- **WHEN** status context `Storybook Publish` has state `pending`
- **THEN** its status is `running`

### Requirement: Reason for a failed or cancelled check
For each check with status `failed` or `cancelled`, the plugin SHALL give a reason, a link, and up to 5 annotations. The reason SHALL be the first of these that is not empty: the check run's output title, the check run's output summary, the first failure-level annotation message, the status context description. The link SHALL be the check's details URL or target URL. The annotations SHALL be only failure-level annotations, each with message, file path, and start line. Warning-level and notice-level annotations SHALL NOT be shown. When a check has more failure-level annotations than are shown, the plugin SHALL give the total count.

#### Scenario: GitHub Actions check with only an annotation
- **WHEN** a failed check run has an empty title and summary and one failure annotation "Process completed with exit code 1."
- **THEN** its reason is "Process completed with exit code 1."
- **AND** its link is the check's details URL

#### Scenario: Cancelled check
- **WHEN** a cancelled check run has the failure annotation "Canceling since a higher priority waiting request for Preliminary Checks-refs/pull/25392/merge exists"
- **THEN** its reason is that annotation message

#### Scenario: Lint warnings are hidden
- **WHEN** a failed check run has 1 failure annotation and 10 warning annotations
- **THEN** the plugin shows only the failure annotation

#### Scenario: Check with no reason text
- **WHEN** a failed check has no title, no summary, no failure annotation, and no description
- **THEN** its reason is empty and the link is still given

### Requirement: Reviewers
The plugin SHALL list each requested reviewer and each reviewer with a latest approving, changes-requested, or dismissed review. Each entry SHALL have a name, a kind (`user`, `team`, or `bot`), a state (`pending`, `approved`, `changes_requested`, `commented`, or `dismissed`), and a code-owner flag. A reviewer with an open review request SHALL have state `pending`, even when that reviewer reviewed before.

#### Scenario: Code owner team review requested
- **WHEN** team `ai-governance` has an open review request as code owner and has not reviewed
- **THEN** the plugin lists `ai-governance`, kind `team`, state `pending`, code owner `true`

#### Scenario: User approved
- **WHEN** user `alice` has an approving latest review and no open review request
- **THEN** the plugin lists `alice`, kind `user`, state `approved`

### Requirement: Merge blockers
The plugin SHALL give the list of reasons why the PR cannot merge now. Each blocker SHALL have a code and a short text. The codes SHALL be:
- `checks_failed`: at least one check has status `failed`
- `checks_running`: at least one check has status `running`
- `review_required`: GitHub reports that a review is required
- `changes_requested`: GitHub reports that changes are requested
- `behind`: the branch is out of date with the base branch
- `conflicts`: the branch has merge conflicts
- `unresolved_threads`: at least one review thread is not resolved (the text gives the count)
- `draft`: the PR is a draft
- `blocked`: GitHub reports the PR as blocked and no other code explains it
A PR that GitHub reports as ready to merge SHALL have an empty blocker list.

#### Scenario: Blocked on code owner review
- **WHEN** GitHub reports merge state `BLOCKED` and review decision `REVIEW_REQUIRED`
- **THEN** the blockers contain `review_required`
- **AND** they do not contain `blocked`

#### Scenario: Branch out of date
- **WHEN** GitHub reports merge state `BEHIND`
- **THEN** the blockers contain `behind`

### Requirement: Refresh
The plugin SHALL refresh the data of each thread with an open PR in the background, at an interval of 60 seconds. It SHALL stop the background refresh for a PR that is merged or closed, after one last refresh that records that state. It SHALL give a manual refresh that updates the data of one thread at once. When a refresh fails, the plugin SHALL keep the last good data, mark it with the time of the last good refresh, and report the error.

#### Scenario: Background refresh
- **WHEN** a thread has an open PR and 60 seconds pass
- **THEN** the plugin gets new data for that PR

#### Scenario: PR merged
- **WHEN** a refresh finds that the PR is merged
- **THEN** the plugin records state `merged`
- **AND** it stops the background refresh for that PR

#### Scenario: Refresh fails
- **WHEN** a refresh fails because GitHub rate-limits the request
- **THEN** the plugin keeps the last good data with its time
- **AND** it reports the error "rate limited"
