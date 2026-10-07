## 1. Repo and scaffold

- [x] 1.1 Remove the "plugins moved to koenvg/bb-plugins" line from `README.md` and verify the README has no reference to `koenvg/bb-plugins`
- [x] 1.2 Scaffold `plugins/claude-usage/` with `bb plugin new`, set id, display name, and icon, add Chart.js, and verify `bb plugin build` succeeds on the empty plugin

## 2. Port host-free modules

- [x] 2.1 Port `transcript.ts` and its tests and verify dedupe, last-record-wins, cache split, and malformed-line tests pass
- [x] 2.2 Port `pricing.ts` with exact model matching (strip `[...]` and `-YYYYMMDD` only) and verify tests cover `claude-opus-5-5[1m]`, a dated Haiku id, and `claude-opus-5-5` as unpriced while it has no entry
- [x] 2.3 Add the `claude-opus-5-5` rate from Anthropic's pricing page and verify a test prices it
- [x] 2.4 Port `spendIndex.ts` and its tests and verify grow-only merge and deleted-transcript retention tests pass
- [x] 2.5 Port `scanner.ts` with a `node:fs` `TranscriptFileSystem` and `CLAUDE_CONFIG_DIR` support and verify scanner tests pass, including subagent discovery and unchanged-file skip
- [x] 2.6 Port `dashboard.ts`, `dailyChartConfig.ts`, and `format.ts` with "task" renamed to "thread" and "unattributed" to "Outside BB", and verify their tests pass

## 3. Backend

- [x] 3.1 Add the SQLite repository for transcript stats and token rows via `bb.storage.migrate` and verify a test that re-reading one transcript replaces only its rows
- [x] 3.2 Implement attribution from projects, environments, and threads (single-thread environment rule, longest prefix wins) and verify tests for worktree, local environment, shared environment, archived thread, and Outside BB
- [x] 3.3 Define the `rescanMinutes` setting (1 to 240, default 5) and verify an out-of-range value is rejected
- [x] 3.4 Add the background service that scans at start, then waits the current interval before each next scan, and stops on abort; verify with a fake clock that an interval change applies after the current wait and that abort writes no partial index
- [x] 3.6 Remember live environment paths in the plugin database and merge them into each attribution load, and verify a test that a destroyed environment's thread still gets its spend
- [x] 3.7 Resolve an unmatched `cwd` under `worktrees/thr_<id>-<n>` to a known thread, and verify tests for a known thread, an unknown thread, and a live path taking precedence
- [x] 3.5 Register the RPC contract `dashboard`, `threadSpend`, `rescan` and verify handler tests return the expected shapes, including the no-spend state for `threadSpend`

## 4. Frontend

- [x] 4.1 Build the dashboard `navPanel` (totals, project, thread, model breakdowns, lower-bound note, unpriced-model banner, rescan button, empty and indexing states, 1-minute refresh) and verify component tests for each state
- [x] 4.2 Build the Chart.js daily chart with theme CSS variable colours and verify `dailyChartConfig` tests and a render test
- [x] 4.3 Add the sidebar accessory with today's figure and verify a component test
- [x] 4.4 Add the thread header action with loading, no-spend, and amount states and verify a component test for each

## 5. Docs and live check

- [x] 5.1 Write `plugins/claude-usage/README.md` and a `skills/` entry covering the setting, attribution limits, and price table updates, and verify both exist
- [x] 5.2 Install the plugin locally and verify: the dashboard totals match the OpenForge plugin on the same transcripts (within the opus-5-5 difference), this thread's header shows a figure, and the sidebar row shows today's amount
