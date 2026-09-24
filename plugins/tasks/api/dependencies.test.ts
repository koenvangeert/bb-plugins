import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it } from "vitest";
import type { z } from "zod";
import type { TaskStatus } from "../db";
import type { TasksRpcContract } from "../shared/contract";
import { createStore, registerTasksApi } from ".";

const disposers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (disposers.length > 0) await disposers.pop()?.();
});

function setup() {
  const { bb, harness } = createFakePluginHost({
    pluginId: "tasks",
    sdk: {
      threads: {
        get: async ({ threadId }) =>
          makeThreadResponse({ id: threadId, status: "active" }),
      },
    },
  });
  disposers.push(() => harness.dispose());
  const store = createStore(bb);
  registerTasksApi(bb, store);
  const project = store.tasks.createProject({
    name: "ABC project",
    prefix: "ABC",
    color: "blue",
  });
  const task = (title: string, status: TaskStatus = "todo") =>
    store.tasks.createTask({ projectId: project.id, title, status });
  const rpc = <K extends keyof TasksRpcContract>(
    name: K,
    input: z.input<TasksRpcContract[K]["input"]>,
  ) =>
    harness.callRpc(name, input) as Promise<
      z.output<TasksRpcContract[K]["output"]>
    >;
  return { harness, rpc, store, project, task };
}

describe("task dependency API", () => {
  it("returns blocker and blocked fields on getTask", async () => {
    const { rpc, task } = setup();
    const [abc1, abc2] = [task("Blocker"), task("Blocked")];
    await rpc("addTaskDependency", {
      blockerTaskId: abc1.id,
      blockedTaskId: abc2.id,
    });

    const blocked = await rpc("getTask", { taskId: abc2.id });
    const blocker = await rpc("getTask", { taskId: abc1.id });

    expect(blocked.task).toMatchObject({
      blockedBy: [
        { id: abc1.id, key: "ABC-1", title: "Blocker", status: "todo" },
      ],
      blocks: [],
      openBlockerCount: 1,
      openBlockedCount: 0,
      blocked: true,
    });
    expect(blocker.task).toMatchObject({
      blockedBy: [],
      blocks: [{ id: abc2.id, key: "ABC-2" }],
      openBlockerCount: 0,
      openBlockedCount: 1,
      blocked: false,
    });
  });

  it("returns empty dependency fields for a task with no links", async () => {
    const { rpc, task } = setup();
    const only = task("Only");

    const result = await rpc("getTask", { taskId: only.id });

    expect(result.task).toMatchObject({
      blockedBy: [],
      blocks: [],
      openBlockerCount: 0,
      openBlockedCount: 0,
      blocked: false,
    });
  });

  it("filters listTasks by ready and blocked", async () => {
    const { rpc, project, task } = setup();
    const [abc1, abc2] = [task("Blocker"), task("Blocked")];
    await rpc("addTaskDependency", {
      blockerTaskId: abc1.id,
      blockedTaskId: abc2.id,
    });

    const blocked = await rpc("listTasks", {
      projectId: project.id,
      dependency: "blocked",
    });
    const ready = await rpc("listTasks", {
      projectId: project.id,
      dependency: "ready",
    });

    expect(blocked.tasks.map((t) => t.key)).toEqual(["ABC-2"]);
    expect(blocked.tasks[0]?.blocked).toBe(true);
    expect(ready.tasks.map((t) => t.key)).toEqual(["ABC-1"]);
  });

  it("returns a cycle error and saves nothing", async () => {
    const { rpc, store, task } = setup();
    const [abc1, abc2] = [task("One"), task("Two")];
    await rpc("addTaskDependency", {
      blockerTaskId: abc1.id,
      blockedTaskId: abc2.id,
    });

    const result = await rpc("addTaskDependency", {
      blockerTaskId: abc2.id,
      blockedTaskId: abc1.id,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "dependency_cycle" },
    });
    expect(result.ok ? "" : result.error.message).toContain(
      "ABC-1 blocks ABC-2 blocks ABC-1",
    );
    expect(store.tasks.listBlockers(abc1.id)).toEqual([]);
  });

  it("returns a self-link error", async () => {
    const { rpc, task } = setup();
    const only = task("Only");

    const result = await rpc("addTaskDependency", {
      blockerTaskId: only.id,
      blockedTaskId: only.id,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "dependency_self" },
    });
  });

  it("publishes tasks:changed for both tasks on add and remove", async () => {
    const { harness, rpc, project, task } = setup();
    const [abc1, abc2] = [task("Blocker"), task("Blocked")];

    await rpc("addTaskDependency", {
      blockerTaskId: abc1.id,
      blockedTaskId: abc2.id,
    });
    const removed = await rpc("removeTaskDependency", {
      blockerTaskId: abc1.id,
      blockedTaskId: abc2.id,
    });

    expect(removed).toEqual({ removed: true });
    const changed = harness.realtimeSignals
      .filter((signal) => signal.channel === "tasks:changed")
      .map((signal) => signal.payload);
    const both = [
      { taskId: abc1.id, projectId: project.id },
      { taskId: abc2.id, projectId: project.id },
    ];
    expect(changed).toEqual([...both, ...both]);
  });

  it("warns when a blocked task moves to in_progress", async () => {
    const { rpc, task } = setup();
    const [abc1, abc2] = [task("Blocker"), task("Blocked")];
    await rpc("addTaskDependency", {
      blockerTaskId: abc1.id,
      blockedTaskId: abc2.id,
    });

    const result = await rpc("updateTask", {
      taskId: abc2.id,
      status: "in_progress",
    });

    expect(result).toMatchObject({
      ok: true,
      task: { status: "in_progress" },
      warnings: ["ABC-2 is blocked by ABC-1 (todo)"],
    });
  });

  it("does not warn when a ready task moves to in_progress", async () => {
    const { rpc, task } = setup();
    const [abc1, abc2] = [task("Blocker", "done"), task("Blocked")];
    await rpc("addTaskDependency", {
      blockerTaskId: abc1.id,
      blockedTaskId: abc2.id,
    });

    const result = await rpc("updateTask", {
      taskId: abc2.id,
      status: "in_progress",
    });

    expect(result).not.toHaveProperty("warnings");
  });
});
