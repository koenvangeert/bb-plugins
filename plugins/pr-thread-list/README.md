# Threads with PRs

A selectable BB sidebar thread list. It uses BB's branch PR lookup to show PR status beside each thread; no Git host credentials are stored by this plugin.

Build: `npm install && bb plugin types && bb plugin build`. Install locally: `bb plugin install .`. Choose **Threads with PRs** in Settings → Appearance → Sidebar. The bundled **Thread list** stays installed and can be selected again at any time.

## List preferences

Use the lifecycle selector above the rows for Active, Archived, or Both. Open **List options** to group by project, machine, or custom section and change the sort order. Group and parent-thread headers collapse their descendants. These choices are saved on this client under a versioned plugin key; they do not migrate from BB's bundled list, so the first selection starts at project/active/newest-first defaults. **Reset list preferences** restores those defaults. If browser storage is unavailable, the list still works, but choices last only until reload.

## PR badges

Each visible thread row with a branch PR shows its number and BB-reported status: **Draft**, **Open**, **Pending** checks, **Failed** checks, **Review** requested, **Changes** requested, **Conflicts**, **Blocked**, **Ready** to merge, **Merged**, or **Closed**. The badge opens the PR without opening the thread. This is the branch PR of the thread's environment: threads sharing an environment can show the same PR. BB owns the Git-host lookup, caching, and refresh; the plugin does not run `gh` or poll. There is no badge while the first lookup is pending, when there is no PR, or when the lookup cannot run. Absence of a badge does not mean checks passed or that a PR was closed.

## Rollout and fallback

Try the plugin on one client first. In Settings → Appearance → Sidebar, select **Threads with PRs**. To roll back, select **Thread list** there; both plugins remain installed, and no thread or PR data needs migration. The replacement's grouping and collapse settings are separate from the bundled list's settings, so switching back does not overwrite them.

Before daily use, note the current parity gaps: group ordering and row density do not exactly match the bundled list; there is no hover-to-archive button, section reorder/delete, or group hide control. Archive, section rename, and thread actions remain available through menus. The plugin currently offers project, machine, and section grouping, not every bundled presentation detail. Recheck these interactions and the experimental SDK contract after BB updates.
