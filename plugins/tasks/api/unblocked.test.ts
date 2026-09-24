import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it } from "vitest";
import type { TaskStatus } from "../db";
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
        send: async () => undefined,
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
  const systemBodies = (taskId: string) =>
    store.tasks
      .listComments(taskId)
      .filter((comment) => comment.kind === "system")
      .map((comment) => comment.body);
  return { harness, store, task, systemBodies };
}

describe("unblocked comment", () => {
  it("comments once when the last open blocker goes to done", async () => {
    const { harness, store, task } = setup();
    const [abc1, abc2] = [task("Blocker"), task("Blocked")];
    store.tasks.addTaskDependency(abc1.id, abc2.id);
    store.tasks.upsertTaskThread({
      taskId: abc2.id,
      threadId: "thr_worker",
      presetName: "Worker",
      title: "Worker",
      liveStatus: "working",
    });

    await harness.callRpc("updateTask", { taskId: abc1.id, status: "done" });

    const comments = store.tasks
      .listComments(abc2.id)
      .filter((comment) => comment.kind === "system");
    expect(comments).toMatchObject([
      { body: "Unblocked: ABC-1 is done", notifiedCount: 0 },
    ]);
    expect(harness.sdk.callsTo("threads.send")).toEqual([]);
    expect(harness.realtimeSignals).toContainEqual({
      channel: "comments:changed",
      payload: { taskId: abc2.id },
    });
  });

  it("comments when a board move cancels the last open blocker", async () => {
    const { harness, store, task, systemBodies } = setup();
    const [abc1, abc2] = [task("Blocker"), task("Blocked")];
    store.tasks.addTaskDependency(abc1.id, abc2.id);

    await harness.callRpc("boardMove", { taskId: abc1.id, status: "canceled" });

    expect(systemBodies(abc2.id)).toEqual(["Unblocked: ABC-1 is canceled"]);
  });

  it("does not comment while another blocker is still open", async () => {
    const { harness, store, task, systemBodies } = setup();
    const [abc1, abc2, abc3] = [task("One"), task("Two"), task("Blocked")];
    store.tasks.addTaskDependency(abc1.id, abc3.id);
    store.tasks.addTaskDependency(abc2.id, abc3.id);

    await harness.callRpc("updateTask", { taskId: abc1.id, status: "done" });

    expect(systemBodies(abc3.id)).toEqual([]);
  });

  it("does not comment when a done blocker is saved as done again", async () => {
    const { harness, store, task, systemBodies } = setup();
    const [abc1, abc2] = [task("Blocker", "done"), task("Blocked")];
    store.tasks.addTaskDependency(abc1.id, abc2.id);

    await harness.callRpc("updateTask", { taskId: abc1.id, status: "done" });
    await harness.callRpc("updateTask", {
      taskId: abc1.id,
      status: "canceled",
    });

    expect(systemBodies(abc2.id)).toEqual([]);
  });
});
