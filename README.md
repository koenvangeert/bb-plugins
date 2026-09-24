# bb-plugins

Six BB plugins, each in its own directory under [`plugins/`](plugins). The four plugins added from [koenvg/bb-plugins](https://github.com/koenvg/bb-plugins) are copied from commit `0824f457f8e94bdac9f2abf7517b9c89132b4c7e`.

| Plugin | Collection name | Directory |
| --- | --- | --- |
| GitHub Insight | `github-insight` | [`plugins/github-insight`](plugins/github-insight) |
| Tasks Plus | `tasks-plus` | [`plugins/tasks`](plugins/tasks) |
| Code Cleanup | `code-cleanup` | [`plugins/code-cleanup`](plugins/code-cleanup) |
| Liquid Glass | `liquid-glass` | [`plugins/liquid-glass`](plugins/liquid-glass) |
| Threads with PRs | `pr-thread-list` | [`plugins/pr-thread-list`](plugins/pr-thread-list) |
| Task Board | `task-board` | [`plugins/task-board`](plugins/task-board) |

Install one plugin at a time with the [collection manifest](.bb/plugins.json):

```sh
bb plugin install git:https://github.com/koenvangeert/bb-plugins.git@main --plugin code-cleanup
```

Replace `code-cleanup` with a collection name from the table. Each plugin's README covers setup, compatibility, and checks. For a local checkout, install the selected plugin's dependencies before building and installing:

```sh
cd plugins/code-cleanup
npm ci
bb plugin build
cd ../..
bb plugin install path:. --plugin code-cleanup
```

Use the matching directory and collection name for other plugins.

Tasks Plus and Task Board are separate plugins. Both show a Tasks view, but Tasks Plus uses `bb tasks` and Task Board uses `bb task-board` with a separate database. Don't install both unless you intend to use both. Code Cleanup's default guidance refers to `bb task-board`.
