A project task board in BB with a detail pane, task-specific thread composer, and matching `bb task-board` command.

## Plan work by project

Create tasks with prompts, priority, labels and prerequisites. Move them between Backlog, In progress and Done, and flag in-progress work as Focus or Out of focus. An unlinked task with finished prerequisites offers Start. BB opens its full composer with the prompt and project filled in; edit the prompt and choose the model, environment and permissions before submitting. Leaving the composer does not change the task.

## Keep tasks close to the work

Submitting the composer starts a thread in the task's project, links it, and moves the task to In progress with Focus attention. A linked task offers Open thread. You can still link an existing same-project thread manually, and agent activity never marks a task Done.

If thread creation is uncertain, the task holds a pending launch rather than starting a second agent. Open **Review launch** from its detail to **Recheck**; the page also updates when another tab links the thread. For an inactive unresolved claim, link a known same-project thread or release only after confirming none was created. BB checks once more before either action. Releasing may allow duplicate work if a thread appears later; it never starts or deletes one, and a new Start requires separate composer submission.

The sidebar and CLI share a SQLite store, and updates appear in open pages without a refresh.
