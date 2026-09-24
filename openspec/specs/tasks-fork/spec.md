# tasks-fork Specification

## Purpose

Defines how the forked Tasks plugin in this repo replaces the bundled bb Tasks plugin while keeping existing data, commands, and agent workflows intact.

## Requirements

### Requirement: Fork keeps the bundled behavior
The fork SHALL keep every behavior of bundled Tasks v0.1.2 that this change does not name: projects, folders, labels, priorities, due dates, subtasks, attachments, comments, presets, delegation, live thread cards, and `@` mentions.

#### Scenario: Existing workflow
- **WHEN** a user creates a task, adds a subtask, and delegates it with a preset in the fork
- **THEN** the result is the same as in bundled Tasks v0.1.2

### Requirement: Own plugin identity
The fork SHALL use a plugin id that is not a bundled bb plugin id. Its display name SHALL be "Tasks".

#### Scenario: Install the fork
- **WHEN** a user installs the fork from this repo
- **THEN** bb accepts the install and shows the plugin as "Tasks"

### Requirement: Same CLI command
The fork SHALL register the `bb tasks` command with the same subcommands and flags as bundled Tasks v0.1.2, plus the dependency flags.

#### Scenario: Agent uses the CLI
- **WHEN** the bundled plugin is disabled, the fork is installed, and an agent runs `bb tasks show ABC-12`
- **THEN** the fork answers the command

### Requirement: One-time data import
The system SHALL give a documented step that copies the data of the bundled Tasks plugin into the fork. After the step, all tasks, keys, comments, labels, folders, projects, presets, thread links, and attachments SHALL be in the fork. The step MUST NOT change the data of the bundled plugin. The step MUST refuse to run when the fork already has tasks.

#### Scenario: Import
- **WHEN** a user runs the import step with 18 tasks in the bundled plugin
- **THEN** the fork has the same 18 tasks with the same keys

#### Scenario: Import twice
- **WHEN** a user runs the import step and the fork already has tasks
- **THEN** the step stops with an error and changes nothing

### Requirement: Rollback
A user SHALL be able to go back to the bundled Tasks plugin by uninstalling the fork and enabling the bundled plugin. The data of the bundled plugin SHALL be as it was before the import. Changes made in the fork SHALL NOT carry back.

#### Scenario: Go back
- **WHEN** a user uninstalls the fork and runs `bb plugin enable tasks`
- **THEN** the bundled plugin shows the tasks as they were before the import
