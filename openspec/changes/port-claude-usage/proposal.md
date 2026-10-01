## Why

Claude Code bills through the API, and BB shows no dollar figure for that spend. The OpenForge `claude-usage` plugin already prices local Claude Code transcripts correctly. Porting it to BB gives the same figures per BB project and thread.

## What Changes

- Add a BB plugin at `plugins/claude-usage/`, ported from the OpenForge `claude-usage` plugin.
- A background service indexes `~/.claude/projects/**/*.jsonl`, including subagent transcripts, and re-reads only changed files.
- The index stores token counts and grows only. Dollars come from a price table at read time.
- A sidebar page `Claude usage` shows spend today, 7 days, 30 days, all time, a 30-day daily chart by cost component, spend per project, top threads, and spend per model.
- The sidebar row shows the 30-day figure.
- The thread header shows the spend of the open thread.
- Spend outside every BB project shows as "Outside BB".
- A model with no price is excluded from totals and named in a banner.
- A plugin setting controls the rescan interval (1 to 240 minutes, default 5).
- Remove the "plugins moved to koenvg/bb-plugins" line from `README.md`. Plugins live in this repo again.

## Capabilities

### New Capabilities

- `claude-usage-index`: reading Claude Code transcripts, deduplicating billed responses, and keeping a grow-only token index.
- `claude-usage-pricing`: converting token counts to USD, and handling unpriced models.
- `claude-usage-attribution`: assigning spend to BB projects and threads, and reporting spend outside BB.
- `claude-usage-ui`: the sidebar page, the sidebar figure, the thread header figure, and the rescan setting.

### Modified Capabilities

None.

## Impact

- New package `plugins/claude-usage/` with backend and frontend bundles.
- New dependency: Chart.js.
- Reads files under `~/.claude` (or `CLAUDE_CONFIG_DIR`) on the BB server host. Reads BB projects, environments, and threads through the SDK. Writes only to the plugin's own storage.
- `README.md` changes.
