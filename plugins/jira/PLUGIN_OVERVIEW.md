See your Jira tickets in BB and connect threads to them.

## What you get

- A **Jira** page in the sidebar with your own tabs, one per JQL query (for example "Ready to pick up" or "This release"), each with its ticket count and the threads working on each ticket.
- **Filters** per tab on status, type, assignee, fix version, and more, saved with the tab.
- **Start thread** on a ticket, with the ticket text as the first prompt.
- The linked ticket and its status in each thread header, with a **Link Jira** picker for threads that have none.

## How it works

The plugin runs the Atlassian CLI (`acli`) on the BB server with your existing login. It stores no Jira credentials and never writes to Jira.
