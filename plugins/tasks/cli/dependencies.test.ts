import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it } from "vitest";

import { createStore } from "../api";
import type { TaskStatus } from "../db";
import plugin from "../server";

const disposers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (disposers.length > 0) await disposers.pop()?.();
});

async function setup() {
  const { bb, harness } = createFakePluginHost({
    pluginId: "tasks",
    sdk: {
      threads: {
        spawn: async () => ({ id: "thr_worker" }),
        get: async ({ threadId }) =>
          makeThreadResponse({ id: threadId, status: "starting" }),
      },
    },
  });
  disposers.push(() => harness.dispose());
  await plugin(bb);
  const store = createStore(bb);
  const project = store.tasks.createProject({
    name: "ABC project",
    prefix: "ABC",
    color: "blue",
    linkedBbProjectId: "proj_bb",
  });
  const task = (title: string, status: TaskStatus = "todo") =>
    store.tasks.createTask({ projectId: project.id, title, status });
  const cli = (...args: string[]) => harness.runCli(args);
  const ok = async (...args: string[]) => {
    const result = await cli(...args);
    expect(result, result.stderr).toMatchObject({ exitCode: 0 });
    return result;
  };
  return { store, task, cli, ok };
}

describe("bb tasks dependencies", () => {
  it("adds blockers by key and by id with update --blocked-by", async () => {
    const { store, task, ok } = await setup();
    const [abc1, abc2, abc3] = [task("One"), task("Two"), task("Three")];

    await ok(
      "update",
      "abc-3",
      "--blocked-by",
      "ABC-1",
      "--blocked-by",
      abc2.id,
    );

    expect(store.tasks.listBlockers(abc3.id).map((t) => t.key)).toEqual([
      abc1.key,
      abc2.key,
    ]);
  });

  it("removes a blocker with update --unblocked-by", async () => {
    const { store, task, ok } = await setup();
    const [abc1, abc2] = [task("One"), task("Two")];
    store.tasks.addTaskDependency(abc1.id, abc2.id);

    await ok("update", "ABC-2", "--unblocked-by", "ABC-1");

    expect(store.tasks.listBlockers(abc2.id)).toEqual([]);
  });

  it("fails on a cycle and saves no field or link", async () => {
    const { store, task, cli } = await setup();
    const [abc1, abc2, abc3] = [task("One"), task("Two"), task("Three")];
    store.tasks.addTaskDependency(abc1.id, abc2.id);

    const result = await cli(
      "update",
      "ABC-1",
      "--title",
      "Renamed",
      "--blocked-by",
      "ABC-3,ABC-2",
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("ABC-1 blocks ABC-2 blocks ABC-1");
    expect(store.tasks.getTask(abc1.id)?.title).toBe("One");
    expect(store.tasks.listBlockers(abc1.id)).toEqual([]);
    expect(store.tasks.listBlockedTasks(abc3.id)).toEqual([]);
  });

  it("lists only ready or only blocked tasks", async () => {
    const { store, task, ok } = await setup();
    const [abc1, abc2] = [task("Blocker"), task("Blocked")];
    store.tasks.addTaskDependency(abc1.id, abc2.id);

    const ready = await ok("list", "--ready", "--json");
    const blocked = await ok("list", "--blocked");

    expect(
      JSON.parse(ready.stdout).tasks.map((t: { key: string }) => t.key),
    ).toEqual(["ABC-1"]);
    expect(blocked.stdout).toContain("BLOCKED BY");
    expect(blocked.stdout).toMatch(/ABC-2 .* ABC-1/);
    expect(blocked.stdout).not.toMatch(/^ABC-1 /m);
  });

  it("rejects list with both --ready and --blocked", async () => {
    const { cli } = await setup();

    const result = await cli("list", "--ready", "--blocked");

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/--ready|--blocked/);
  });

  it("shows blockers, blocked tasks, and the blocked state", async () => {
    const { store, task, ok } = await setup();
    const [abc1, abc2, abc3] = [
      task("Blocker"),
      task("Middle"),
      task("Downstream"),
    ];
    store.tasks.addTaskDependency(abc1.id, abc2.id);
    store.tasks.addTaskDependency(abc2.id, abc3.id);

    const human = (await ok("show", "ABC-2")).stdout;
    const json = JSON.parse((await ok("show", "ABC-2", "--json")).stdout);

    expect(human).toMatch(/Blocked\s+yes, by ABC-1/);
    expect(human).toMatch(
      /Blocked by\nKEY\s+STATUS\s+TITLE\nABC-1\s+todo\s+Blocker/,
    );
    expect(human).toMatch(
      /Blocks\nKEY\s+STATUS\s+TITLE\nABC-3\s+todo\s+Downstream/,
    );
    expect(json).toMatchObject({
      blocked: true,
      blockedBy: [{ key: "ABC-1", status: "todo", title: "Blocker" }],
      blocks: [{ key: "ABC-3", status: "todo", title: "Downstream" }],
      task: { openBlockerCount: 1, openBlockedCount: 1 },
    });
  });

  it("shows no blockers for a task with no links", async () => {
    const { task, ok } = await setup();
    task("Only");

    const human = (await ok("show", "ABC-1")).stdout;

    expect(human).toMatch(/Blocked\s+no/);
    expect(human).toContain("Blocked by\n(none)");
    expect(human).toContain("Blocks\n(none)");
  });

  it("warns on stderr when a blocked task goes to in_progress", async () => {
    const { store, task, ok } = await setup();
    const [abc1, abc2] = [task("Blocker"), task("Blocked")];
    store.tasks.addTaskDependency(abc1.id, abc2.id);

    const human = await ok("update", "ABC-2", "--status", "in_progress");

    expect(human.stdout).toContain("Updated ABC-2");
    expect(human.stderr).toBe("warning: ABC-2 is blocked by ABC-1 (todo)");
    expect(store.tasks.getTask(abc2.id)?.status).toBe("in_progress");
  });

  it("puts the update warning in warnings with --json", async () => {
    const { store, task, ok } = await setup();
    const [abc1, abc2] = [task("Blocker"), task("Blocked")];
    store.tasks.addTaskDependency(abc1.id, abc2.id);

    const result = await ok(
      "update",
      "ABC-2",
      "--status",
      "in_progress",
      "--json",
    );

    expect(JSON.parse(result.stdout).warnings).toEqual([
      "ABC-2 is blocked by ABC-1 (todo)",
    ]);
  });

  it("does not warn when a ready task goes to in_progress", async () => {
    const { store, task, ok } = await setup();
    const [abc1, abc2] = [task("Blocker", "done"), task("Blocked")];
    store.tasks.addTaskDependency(abc1.id, abc2.id);

    const result = await ok("update", "ABC-2", "--status", "in_progress");

    expect(result.stderr).toBe("");
  });

  it("dispatches a blocked task and warns", async () => {
    const { store, task, ok } = await setup();
    const [abc1, abc2] = [task("Blocker"), task("Blocked")];
    store.tasks.addTaskDependency(abc1.id, abc2.id);
    store.tasks.createPreset({
      name: "Worker",
      providerId: "claude-code",
      modelId: "claude-sonnet-5",
      reasoningLevel: "high",
      serviceTier: "default",
      permissionMode: "full",
      environmentKind: "project-default",
      baseBranch: null,
      machineId: null,
      instructions: "",
      builtin: false,
    });

    const human = await ok("dispatch", "ABC-2", "--preset", "Worker");
    const json = await ok("dispatch", "ABC-2", "--preset", "Worker", "--json");

    expect(human.stdout).toBe("thr_worker");
    expect(human.stderr).toBe("warning: ABC-2 is blocked by ABC-1 (todo)");
    expect(JSON.parse(json.stdout)).toMatchObject({
      threadId: "thr_worker",
      warnings: ["ABC-2 is blocked by ABC-1 (todo)"],
    });
  });
});
