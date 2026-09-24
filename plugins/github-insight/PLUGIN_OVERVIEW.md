See the checks of a thread's pull request without leaving bb.

- A **PR** tab in the thread's right panel.
- The PR number, title, state, and a link to GitHub.
- Every check on the head commit, one entry per check name, grouped by status.
- Failed and cancelled checks show why: a reason and up to 5 failure annotations.

The plugin uses the `gh` CLI login of the host that runs the thread. It needs no token of its own.
