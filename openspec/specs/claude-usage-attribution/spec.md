# claude-usage-attribution Specification

## Purpose

Assigns recorded spend to the BB project and thread that caused it, so the dashboard and a thread show the same figure and no spend is quietly dropped.

## Requirements

### Requirement: Project attribution by directory

Spend SHALL be attributed to a BB project when its recorded working directory lies within one of the project's source paths or within the path of an environment that belongs to the project. Matching SHALL be by directory prefix, and the longest matching path SHALL win.

Spend that matches no project SHALL be reported as "Outside BB". It SHALL NOT be hidden or spread across projects.

#### Scenario: Directory inside a project source

- **WHEN** spend is recorded in a directory inside a project's local source path
- **THEN** that project's total includes it

#### Scenario: Worktree outside the project source

- **WHEN** spend is recorded in a worktree environment path that lies outside every project source path
- **THEN** the environment's project includes it

#### Scenario: Directory outside BB

- **WHEN** spend is recorded in a directory that matches no project source and no environment
- **THEN** it is reported as "Outside BB"

### Requirement: Thread attribution by environment

Spend SHALL be attributed to a thread only when its recorded working directory lies within the path of an environment that exactly one Claude Code thread uses. Spend in an environment shared by more than one thread, or in a project source path, SHALL count for the project only.

A project's total SHALL cover all spend in its paths, whether or not a thread claims it.

#### Scenario: Thread in its own worktree

- **WHEN** a Claude Code thread is the only thread in a worktree environment
- **THEN** that thread reports the spend recorded in the environment path

#### Scenario: Thread in a local environment

- **WHEN** two threads run in the project's local source directory
- **THEN** neither thread reports that spend
- **AND** the project's total includes it

#### Scenario: Thread archived

- **WHEN** a thread with attributed spend is archived
- **THEN** the thread still reports its spend

### Requirement: Attribution survives environment cleanup

Spend recorded in an environment SHALL keep its project and thread after BB destroys that environment. A path SHALL be remembered once seen on a live environment. A working directory inside a BB worktree folder named for a thread (`worktrees/thr_<id>-<n>`) SHALL resolve to that thread when BB knows the thread and no live or remembered path matches.

#### Scenario: Worktree destroyed after the plugin saw it

- **WHEN** a thread's worktree environment is destroyed after the plugin recorded its path
- **THEN** the thread and its project still report the spend recorded there

#### Scenario: Worktree destroyed before the plugin was installed

- **WHEN** spend is recorded under `.../worktrees/thr_abc-1/repo` and thread `thr_abc` exists in BB
- **THEN** thread `thr_abc` and its project report that spend

#### Scenario: Worktree folder names an unknown thread

- **WHEN** spend is recorded under `.../worktrees/thr_gone-1/repo` and BB has no thread `thr_gone`
- **THEN** the spend is reported as "Outside BB"

### Requirement: A thread with no attributed spend is distinguishable

A surface showing a thread's spend SHALL distinguish "no spend recorded" from an amount that prices to zero. While the figure loads, the surface SHALL show neither, and SHALL NOT show a zero amount that later changes.

#### Scenario: Thread in a shared environment

- **WHEN** the open thread has no attributable environment
- **THEN** the thread shows that no spend is recorded, not an amount

#### Scenario: Figure loading

- **WHEN** the thread's spend has not resolved yet
- **THEN** the thread shows neither an amount nor a no-spend state

### Requirement: Dashboard and thread agree

The dashboard's thread list SHALL use the same attribution rule as the thread header, so one thread shows one figure everywhere.

#### Scenario: Same thread on both surfaces

- **WHEN** a thread appears in the dashboard's top threads
- **THEN** its figure equals the figure in its thread header
