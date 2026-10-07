## 1. Scaffold

- [x] 1.1 Scaffold `plugins/jira/` with `bb plugin new`, set id `jira`, display name "Jira", and an icon, add zod and vitest, and verify `bb plugin build` succeeds on the empty plugin

## 2. acli access (host-free)

- [x] 2.1 Record fixtures from real `acli` runs (search, view with ADF description, view of an unknown key, auth status logged in and logged out) into `src/fixtures/`, with personal data replaced, and verify each file parses as the expected JSON or text
- [x] 2.2 Add the `AcliRunner` interface, the `execFile` runner (no shell, 30s timeout), and a fake runner, and verify a test that the JQL is passed as one argument
- [x] 2.3 Add the search and view parsers with zod and the browse URL derivation, and verify tests on the fixtures, including the "unexpected acli output" error
- [x] 2.4 Add error classification (`missing`, `loggedOut`, `notFound`, `timeout`, `failed`) and verify one test per class
- [x] 2.5 Port OpenForge `adf.rs` to `src/adf.ts` with its test cases and verify they pass on the view fixture

## 3. Backend

- [x] 3.1 Add the database migration for `tickets`, `refresh_state`, and `thread_links`, and verify a test that a failed refresh keeps the last good list and stores the error
- [x] 3.2 Define the `jql` setting (default `assignee = currentUser() AND statusCategory != Done`) and the `refreshMinutes` setting (1 to 240, default 5), and verify a test that 0 and 241 are rejected
- [x] 3.3 Add the refresh service (refresh at start, re-read interval before each wait, stop on abort, single-flight manual refresh) and verify with a fake clock that an interval change applies after the current wait and that a manual refresh during a refresh runs `acli` once
- [x] 3.4 Wire health to `bb.status.needsConfiguration` and verify a test that `missing` and `loggedOut` set it and a later good refresh clears the page message (the plugin status clears on reload)
- [x] 3.5 Add link and unlink (metadata plus index, relink replaces, key format check, unknown key fails) and verify tests for each scenario in the `jira-thread-link` link and unlink requirements
- [x] 3.6 Add `startThread` (spawn with title `<KEY>: <summary>`, prompt, `pluginMetadata`, index row) and the prompt prefill builder, and verify tests for title, metadata, and prefill content
- [x] 3.7 Add linked-thread resolution for the page (drop deleted and mismatched, mark archived) and the thread delete event handler, and verify tests for deleted, archived, and mismatched threads
- [x] 3.8 Add the RPC contract and handlers from design decision 9 and verify a handler test for each method with a fake runner and a test database
- [x] 3.9 Make `startThread` spawn with the project's default permission mode, else `full`, with an `explicit` source (design decision 10), and verify tests for a project default, a `null` default, and the source

## 4. Frontend

- [x] 4.1 Add the "Jira" `navPanel` page: refresh line, Refresh button, health banner, limit notice, ticket rows with Jira links and thread chips, and verify with the frontend test harness for the loaded, empty, error-with-cache, missing, and logged-out states
- [x] 4.2 Add the Start thread dialog (project select, prefilled prompt, Start disabled without a project, navigate on success) and verify harness tests for prefill, cancel, and start
- [x] 4.3 Add the thread header chip and popover (linked, unknown status, Link Jira picker with list and key input, unlink) and verify harness tests for each state
- [x] 4.4 Write `plugins/jira/README.md`: needs `acli` on the BB server host, login command, settings, and what the plugin does not do; verify the commands in it run as written

## 5. Integration

- [x] 5.1 Install the plugin with `bb plugin install ./plugins/jira`, and verify by hand: my tickets show, Start thread creates a linked thread that opens, the header chip shows status, link by typed key works, unlink works, and logging out of `acli` shows the login message
