# Jira

Shows my Jira tickets in BB and links BB threads to them. It reads Jira through the Atlassian CLI (`acli`), so it stores no Jira credentials.

## What it adds

- A `Jira` page in the sidebar. It lists the tickets that match the `jql` setting, with status and the threads linked to each ticket.
- **Start thread** on a ticket: pick a project, edit the first prompt, and start a thread that is linked to the ticket.
- A control in the thread header. A linked thread shows `KEY · Status`. An unlinked thread shows **Link Jira**, where you pick a ticket or type a key.

## Requirements

`acli` must be on `PATH` on the BB server host and logged in to Jira:

```bash
acli jira auth login
acli jira auth status
```

When `acli` is missing or logged out, the page says what to do and the plugin shows as needing configuration in `bb plugin list`. After you fix it, the page message goes on the next refresh. The plugin status goes after a reload:

```bash
bb plugin reload jira
```

## How links are stored

A link is the key `issueKey` in this plugin's metadata namespace on the thread. It survives a reinstall. The plugin also keeps its own table from thread to key, because the SDK cannot list threads by metadata. The page checks each row against the thread before it shows it, and drops rows whose thread is deleted or carries another key.

## Settings

| Setting | Default | Effect |
| --- | --- | --- |
| `jql` | `assignee = currentUser() AND statusCategory != Done` | Which tickets the page shows |
| `refreshMinutes` | `5` (1 to 240) | Wait between refreshes. A change applies after the current wait. |

```bash
bb plugin config jira set jql "project = ABC AND assignee = currentUser()"
bb plugin config jira set refreshMinutes 15
```

The page shows at most 200 tickets and says when it hits that limit.

## Limits

- Read-only. The plugin never changes Jira: no transitions, no comments.
- It does not link threads from branch names.
- `acli` runs on the BB server host only.

## Development

```bash
npm install --include=dev
npm test && npm run typecheck
bb plugin build
```

Tests use Node's built-in `node:sqlite` and a fake `acli` runner.
