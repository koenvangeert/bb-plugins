# Spec Delta

## Purpose

Connects BB threads to Jira tickets, so the user can start agent work from a ticket and see which ticket a thread belongs to.

## ADDED Requirements

### Requirement: One ticket per thread
A thread SHALL be linked to zero or one Jira ticket. A ticket MAY be linked to many threads. The link SHALL be stored on the thread, so it survives plugin restarts and reinstalls.

#### Scenario: Relink replaces the link
- **WHEN** a thread linked to `ABC-12` is linked to `ABC-40`
- **THEN** the thread is linked only to `ABC-40`, and `ABC-12` no longer lists that thread

#### Scenario: Many threads on one ticket
- **WHEN** two threads are linked to `ABC-12`
- **THEN** both links exist at the same time

### Requirement: Start a linked thread from a ticket
"Start thread" on a ticket SHALL open a dialog with a BB project picker and an editable first prompt. Confirming SHALL start a thread in the chosen project, titled `<KEY>: <summary>`, linked to the ticket.

#### Scenario: Start thread
- **WHEN** the user clicks "Start thread" on `ABC-40` "Add export", picks project `catalog`, and confirms
- **THEN** a thread titled "ABC-40: Add export" starts in `catalog` with the dialog's prompt, is linked to `ABC-40`, and opens

#### Scenario: Prompt prefill
- **WHEN** the dialog opens for a ticket
- **THEN** the prompt contains the ticket key, summary, Jira URL, and description as plain text, and the user can edit it before confirming

#### Scenario: Cancel
- **WHEN** the user closes the dialog without confirming
- **THEN** no thread starts

#### Scenario: Project required
- **WHEN** no project is picked
- **THEN** the dialog cannot be confirmed

### Requirement: Thread header shows the linked ticket
On a linked thread, the thread header SHALL show the ticket key and its status. Clicking it SHALL show the summary, an "Open in Jira" link, and an unlink control.

#### Scenario: Linked thread header
- **WHEN** the user opens a thread linked to `ABC-12` with status "In Progress"
- **THEN** the header shows `ABC-12 . In Progress`

#### Scenario: Ticket not in the cached list
- **WHEN** the linked ticket is not in the current ticket list (for example, it is done or assigned to someone else)
- **THEN** the plugin reads that one ticket through `acli` and the header shows its current status

#### Scenario: Ticket cannot be read
- **WHEN** the linked ticket cannot be read (deleted, no access, or `acli` fails)
- **THEN** the header still shows the key, marks the status as unknown, and keeps the unlink control

### Requirement: Link a thread by hand
On a thread with no ticket, the thread header SHALL show a "Link Jira" control. It SHALL let the user pick a ticket from the ticket list or type a ticket key.

#### Scenario: Link from the list
- **WHEN** the user clicks "Link Jira" on a thread and picks `ABC-12` from the list
- **THEN** the thread is linked to `ABC-12` and the header shows `ABC-12` and its status

#### Scenario: Link by typed key
- **WHEN** the user types `XYZ-7`, a ticket that exists but is not in the list
- **THEN** the plugin reads `XYZ-7` through `acli`, links the thread, and shows its status

#### Scenario: Unknown key
- **WHEN** the user types a key that `acli` cannot read
- **THEN** the thread is not linked and the control shows the error

#### Scenario: Invalid key format
- **WHEN** the user types text that is not a Jira key (pattern `[A-Z][A-Z0-9]+-[0-9]+`)
- **THEN** the control rejects it without calling `acli`

### Requirement: Unlink a thread
A linked thread SHALL have an unlink control that removes the link.

#### Scenario: Unlink
- **WHEN** the user unlinks a thread from `ABC-12`
- **THEN** the header shows "Link Jira" and the `ABC-12` row no longer lists that thread

### Requirement: Archived and deleted threads
The ticket list SHALL NOT show deleted threads. It SHALL show archived threads as archived.

#### Scenario: Deleted thread
- **WHEN** a thread linked to `ABC-12` is deleted
- **THEN** the `ABC-12` row no longer lists it

#### Scenario: Archived thread
- **WHEN** a thread linked to `ABC-12` is archived
- **THEN** the `ABC-12` row lists it marked as archived
