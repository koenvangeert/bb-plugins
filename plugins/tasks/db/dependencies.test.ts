import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it } from "vitest";
import { createTasksStore, TaskDependencyError, type TaskStatus } from ".";

const disposers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (disposers.length > 0) await disposers.pop()?.();
});

function setup() {
  const { bb, harness } = createFakePluginHost({ pluginId: "tasks-deps-test" });
  disposers.push(() => harness.dispose());
  const db = bb.storage.database();
  const store = createTasksStore(db);
  const project = store.createProject({
    name: "ABC project",
    prefix: "ABC",
    color: "blue",
  });
  const task = (title: string, status: TaskStatus = "todo") =>
    store.createTask({ projectId: project.id, title, status });
  return { db, store, project, task };
}

function dependencyError(run: () => unknown): TaskDependencyError {
  try {
    run();
  } catch (error) {
    if (error instanceof TaskDependencyError) return error;
    throw error;
  }
  throw new Error("expected a TaskDependencyError");
}

describe("task dependency schema", () => {
  it("creates the dependency table on a new database", () => {
    const { db } = setup();
    const versions = db
      .prepare<[], { version: number }>(
        "SELECT version FROM schema_version ORDER BY version",
      )
      .all()
      .map((row) => row.version);
    expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(
      db
        .prepare<[], { name: string }>(
          "SELECT name FROM sqlite_master WHERE tbl_name = 'task_dependencies' ORDER BY name",
        )
        .all()
        .map((row) => row.name),
    ).toEqual([
      "idx_task_dependencies_blocked",
      "sqlite_autoindex_task_dependencies_1",
      "task_dependencies",
      "task_list_revision_dependencies_delete",
      "task_list_revision_dependencies_insert",
    ]);
  });

  it("upgrades a version 6 database and keeps its tasks", () => {
    const { db, store, task } = setup();
    const existing = task("Existing");
    db.exec(`
      DROP TABLE task_dependencies;
      DELETE FROM schema_version WHERE version = 7;
    `);

    const upgraded = createTasksStore(db);
    const blocker = upgraded.createTask({
      projectId: existing.projectId,
      title: "Blocker",
    });
    upgraded.addTaskDependency(blocker.id, existing.id);

    expect(store.getTask(existing.id)?.key).toBe("ABC-1");
    expect(upgraded.listBlockers(existing.id).map((t) => t.key)).toEqual([
      "ABC-2",
    ]);
  });

  it("rejects a self-link in SQL", () => {
    const { db, task } = setup();
    const only = task("Only");
    expect(() =>
      db
        .prepare(
          "INSERT INTO task_dependencies (blocker_task_id, blocked_task_id, created_at) VALUES (?, ?, ?)",
        )
        .run(only.id, only.id, new Date().toISOString()),
    ).toThrow(/CHECK constraint failed/);
  });

  it("bumps the task-list revision when a link is added or removed", () => {
    const { db, store, task } = setup();
    const [a, b] = [task("A"), task("B")];
    const revision = () =>
      db
        .prepare<[], { revision: number }>(
          "SELECT revision FROM task_list_revision WHERE id = 1",
        )
        .get()?.revision ?? -1;

    const before = revision();
    store.addTaskDependency(a.id, b.id);
    const afterAdd = revision();
    store.removeTaskDependency(a.id, b.id);

    expect(afterAdd).toBe(before + 1);
    expect(revision()).toBe(before + 2);
  });
});

describe("task dependency links", () => {
  it("adds a link visible from both tasks", () => {
    const { store, task } = setup();
    const [blocker, blocked] = [task("Blocker"), task("Blocked")];

    expect(store.addTaskDependency(blocker.id, blocked.id)).toBe(true);

    expect(store.listBlockers(blocked.id).map((t) => t.key)).toEqual([
      blocker.key,
    ]);
    expect(store.listBlockedTasks(blocker.id).map((t) => t.key)).toEqual([
      blocked.key,
    ]);
  });

  it("keeps one link when the same link is added twice", () => {
    const { store, task } = setup();
    const [blocker, blocked] = [task("Blocker"), task("Blocked")];

    store.addTaskDependency(blocker.id, blocked.id);
    expect(store.addTaskDependency(blocker.id, blocked.id)).toBe(false);

    expect(store.listBlockers(blocked.id)).toHaveLength(1);
  });

  it("removes a link from both tasks", () => {
    const { store, task } = setup();
    const [blocker, blocked] = [task("Blocker"), task("Blocked")];
    store.addTaskDependency(blocker.id, blocked.id);

    expect(store.removeTaskDependency(blocker.id, blocked.id)).toBe(true);
    expect(store.removeTaskDependency(blocker.id, blocked.id)).toBe(false);

    expect(store.listBlockers(blocked.id)).toEqual([]);
    expect(store.listBlockedTasks(blocker.id)).toEqual([]);
  });

  it("rejects a task that blocks itself", () => {
    const { store, task } = setup();
    const only = task("Only");

    const error = dependencyError(() =>
      store.addTaskDependency(only.id, only.id),
    );

    expect(error.code).toBe("dependency_self");
    expect(store.listBlockers(only.id)).toEqual([]);
  });

  it("rejects a three-task cycle and names every task in it", () => {
    const { store, task } = setup();
    const [abc3, abc4, abc5] = [task("Three"), task("Four"), task("Five")];
    store.addTaskDependency(abc3.id, abc4.id);
    store.addTaskDependency(abc4.id, abc5.id);

    const error = dependencyError(() =>
      store.addTaskDependency(abc5.id, abc3.id),
    );

    expect(error.code).toBe("dependency_cycle");
    expect(error.message).toContain(
      `${abc3.key} blocks ${abc4.key} blocks ${abc5.key} blocks ${abc3.key}`,
    );
    expect(store.listBlockers(abc3.id)).toEqual([]);
  });

  it("saves a link between tasks of different projects", () => {
    const { store, task } = setup();
    const other = store.createProject({
      name: "XYZ project",
      prefix: "XYZ",
      color: "green",
    });
    const xyz1 = store.createTask({ projectId: other.id, title: "Other" });
    const abc = task("Blocked");

    store.addTaskDependency(xyz1.id, abc.id);

    expect(store.listBlockers(abc.id).map((t) => t.key)).toEqual(["XYZ-1"]);
  });
});

describe("task dependency state", () => {
  it("marks a task blocked while a blocker is todo", () => {
    const { store, task } = setup();
    const [blocker, blocked] = [task("Blocker", "todo"), task("Blocked")];
    store.addTaskDependency(blocker.id, blocked.id);

    const state = store.dependencyState([blocked.id, blocker.id]);

    expect(state.get(blocked.id)).toEqual({
      blockedBy: [
        { id: blocker.id, key: "ABC-1", title: "Blocker", status: "todo" },
      ],
      blocks: [],
      openBlockerIds: [blocker.id],
      openBlockedIds: [],
    });
    expect(state.get(blocker.id)?.openBlockedIds).toEqual([blocked.id]);
  });

  it("marks a task ready when its blockers are done and canceled", () => {
    const { store, task } = setup();
    const done = task("Done", "done");
    const canceled = task("Canceled", "canceled");
    const blocked = task("Blocked");
    store.addTaskDependency(done.id, blocked.id);
    store.addTaskDependency(canceled.id, blocked.id);

    const state = store.dependencyState([blocked.id]).get(blocked.id);

    expect(state?.blockedBy.map((ref) => ref.status)).toEqual([
      "done",
      "canceled",
    ]);
    expect(state?.openBlockerIds).toEqual([]);
  });

  it("marks a task blocked again when a blocker is reopened", () => {
    const { store, task } = setup();
    const [blocker, blocked] = [task("Blocker", "done"), task("Blocked")];
    store.addTaskDependency(blocker.id, blocked.id);

    store.updateTask(blocker.id, { status: "todo" });

    expect(
      store.dependencyState([blocked.id]).get(blocked.id)?.openBlockerIds,
    ).toEqual([blocker.id]);
  });

  it("does not let an open subtask block its parent", () => {
    const { store, task } = setup();
    const parent = task("Parent");
    store.createTask({
      projectId: parent.projectId,
      title: "Child",
      status: "todo",
      parentTaskId: parent.id,
    });

    expect(
      store.dependencyState([parent.id]).get(parent.id)?.openBlockerIds,
    ).toEqual([]);
  });

  it("removes the link when a blocker is deleted", () => {
    const { store, task } = setup();
    const [blocker, blocked] = [task("Blocker"), task("Blocked")];
    store.addTaskDependency(blocker.id, blocked.id);

    store.deleteTask(blocker.id);

    expect(store.dependencyState([blocked.id]).get(blocked.id)).toEqual({
      blockedBy: [],
      blocks: [],
      openBlockerIds: [],
      openBlockedIds: [],
    });
  });

  it("does not count a done blocker as blocking open tasks", () => {
    const { store, task } = setup();
    const [blocker, blocked] = [task("Blocker", "done"), task("Blocked")];
    store.addTaskDependency(blocker.id, blocked.id);

    const state = store.dependencyState([blocker.id]).get(blocker.id);

    expect(state?.blocks.map((ref) => ref.id)).toEqual([blocked.id]);
    expect(state?.openBlockedIds).toEqual([]);
  });
});

describe("task dependency list filters", () => {
  it("pages ready and blocked tasks with a cursor", () => {
    const { store, project, task } = setup();
    const blocker = task("Blocker");
    const blocked = [task("Blocked 1"), task("Blocked 2"), task("Blocked 3")];
    const ready = [task("Ready 1"), task("Ready 2")];
    for (const item of blocked) store.addTaskDependency(blocker.id, item.id);
    const doneBlocker = task("Done blocker", "done");
    store.addTaskDependency(doneBlocker.id, ready[1]!.id);

    const collect = (dependency: "ready" | "blocked") => {
      const keys: string[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const page = store.listTasksPage({
          projectId: project.id,
          statuses: ["todo"],
          dependency,
          limit: 2,
          ...(cursor === undefined ? {} : { cursor }),
        });
        keys.push(...page.tasks.map((t) => t.key));
        cursor = page.nextCursor ?? undefined;
        pages += 1;
      } while (cursor !== undefined);
      return { keys, pages };
    };

    expect(collect("blocked")).toEqual({
      keys: blocked.map((t) => t.key),
      pages: 2,
    });
    expect(collect("ready")).toEqual({
      keys: [blocker.key, ...ready.map((t) => t.key)],
      pages: 2,
    });
  });

  it("rejects a cursor reused with another dependency filter", () => {
    const { store, project, task } = setup();
    task("One");
    task("Two");
    const page = store.listTasksPage({
      projectId: project.id,
      dependency: "ready",
      limit: 1,
    });

    expect(() =>
      store.listTasksPage({
        projectId: project.id,
        dependency: "blocked",
        limit: 1,
        cursor: page.nextCursor ?? "",
      }),
    ).toThrow(/does not match the current filters/);
  });
});
