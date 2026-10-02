# Jira

Shows my Jira tickets in BB and links BB threads to them. It reads Jira through the Atlassian CLI (`acli`), so it stores no Jira credentials.

## What it adds

- A `Jira` page in the sidebar with one tab per JQL query. Each tab shows its ticket count, and lists its tickets with status and the threads linked to each ticket.
- **Start thread** on a ticket: pick a project, edit the first prompt, and start a thread that is linked to the ticket.
- A control in the thread header. A linked thread shows `KEY · Status`. An unlinked thread shows **Link Jira**, where you pick a ticket from any tab or type a key.

## Tabs

- **Add tab** asks for a name and a JQL query. Save runs the query once. A bad query shows the `acli` error and saves nothing.
- The pencil edits the selected tab. The bin deletes it. Deleting a tab does not unlink threads.
- The first start makes one tab, "My tickets", with `assignee = currentUser() AND statusCategory != Done`. Edit it like any other tab.
- Examples: `status = "Ready for Dev" AND assignee is EMPTY`, `fixVersion in unreleasedVersions()`, `duedate < now() AND statusCategory != Done`.

Each refresh reads every tab, one after the other. A tab with a bad query keeps its last good list and shows its error. The other tabs are not affected. Each tab shows at most 200 tickets and says when it hits that limit.

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
| `refreshMinutes` | `5` (1 to 240) | Wait between refreshes. A change applies after the current wait. |

```bash
bb plugin config jira set refreshMinutes 15
```

There is no `jql` setting. Tabs hold the queries. An earlier custom `jql` value is not copied: add it as a tab.

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
