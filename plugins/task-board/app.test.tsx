// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { Task } from "./server";

let unmount: (() => void) | undefined;
afterEach(() => { unmount?.(); unmount = undefined; vi.restoreAllMocks(); });

const makeTask = (id: string, prompt: string, changes: Partial<Task> = {}): Task => ({
  id, projectId: "proj_one", prompt, priority: "normal", status: "backlog",
  focus: null, labels: [], dependsOn: [], threadId: null,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...changes,
});
type StartStateFixture = { canStart: boolean; reason: string | null; threadId: string | null; pending: boolean; active: boolean; launchToken: string | null };

async function board(tasks: Task[], startOverride?: (id: string) => StartStateFixture) {
  const app = await loadPluginApp(() => import("./app"));
  const slot = renderSlot(app.navPanels[0]!, { subPath: "" }, {
    context: { projectId: "proj_one", threadId: null },
    rpc: {
      tasks_projects: () => ({ projects: [{ id: "proj_one", name: "One" }] }),
      tasks_list: ({ view, query = "", limit = 200, offset = 0 }: { view: string; query: string; limit: number; offset: number }) => {
        const filtered = tasks.filter((task) => {
          const inView = view === "focus" ? task.status === "doing" && task.focus === "focus" :
            view === "in-flight" ? task.status === "doing" :
            view === "out-of-focus" ? task.status === "doing" && task.focus === "out-of-focus" : task.status === view;
          return inView && task.prompt.toLowerCase().includes(query.toLowerCase());
        });
        return { tasks: filtered.slice(offset, offset + limit), total: filtered.length,
          counts: { focus: tasks.filter((task) => task.focus === "focus" && task.status === "doing").length,
            "in-flight": tasks.filter((task) => task.status === "doing").length,
            "out-of-focus": tasks.filter((task) => task.focus === "out-of-focus").length,
            backlog: tasks.filter((task) => task.status === "backlog").length,
            done: tasks.filter((task) => task.status === "done").length } };
      },
      tasks_start_state: ({ id }: { id: string }) => {
        if (startOverride) return startOverride(id);
        const task = tasks.find((item) => item.id === id)!;
        const blocked = task.dependsOn.some((dependency) => tasks.find((item) => item.id === dependency)?.status !== "done");
        return { canStart: !task.threadId && task.status !== "done" && !blocked,
          threadId: task.threadId, pending: false, active: false, launchToken: null,
          reason: blocked ? "Finish prerequisites before starting this task" : task.status === "done" ? "Completed tasks cannot start a thread" : null };
      },
      tasks_get: ({ id }: { id: string }) => tasks.find((task) => task.id === id)!,
      tasks_create: (input: { prompt: string; priority?: Task["priority"] }) => {
        const task = makeTask("TASK-new", input.prompt, { priority: input.priority ?? "normal" });
        tasks.push(task);
        return task;
      },
      tasks_update: (input: Partial<Task> & { id: string; expectedUpdatedAt?: string }) => {
        const task = tasks.find((item) => item.id === input.id)!;
        if (input.expectedUpdatedAt && input.expectedUpdatedAt !== task.updatedAt) throw new Error("Task changed elsewhere");
        const { expectedUpdatedAt: _expected, ...patch } = input;
        Object.assign(task, patch, { updatedAt: "2026-01-01T00:00:02.000Z" });
        return task;
      },
      tasks_remove: ({ id }: { id: string }) => { tasks.splice(tasks.findIndex((item) => item.id === id), 1); return { removed: true }; },
    },
  });
  unmount = () => slot.lifecycle.unmount();
  return slot;
}

it("creates, displays and edits a project task from the sidebar", async () => {
  const tasks: Task[] = [];
  await board(tasks);
  await screen.findByText("No tasks here. Create one or choose another view.");
  fireEvent.click(screen.getByRole("button", { name: /New task/i }));
  fireEvent.change(screen.getByRole("textbox", { name: "Prompt" }), { target: { value: "Ship board" } });
  fireEvent.click(screen.getByRole("button", { name: "Create task" }));
  await screen.findByText("Ship board");
  fireEvent.change(screen.getByRole("combobox", { name: "Status" }), { target: { value: "doing" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(tasks[0]?.status).toBe("doing"));
  expect(tasks[0]?.focus).toBe("focus");
});

it("asks only for a prompt when creating a task", async () => {
  const tasks: Task[] = [];
  await board(tasks);
  await screen.findByText("No tasks here. Create one or choose another view.");
  fireEvent.click(screen.getByRole("button", { name: /New task/i }));
  expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();
  expect(screen.queryByRole("combobox", { name: "Priority" })).toBeNull();
  const create = screen.getByRole("button", { name: "Create task" });
  expect(create).toHaveProperty("disabled", true);
  fireEvent.change(screen.getByRole("textbox", { name: "Prompt" }), { target: { value: "Write docs\n\nInclude examples" } });
  fireEvent.click(create);
  await waitFor(() => expect(tasks[0]).toMatchObject({ prompt: "Write docs\n\nInclude examples" }));
  expect(tasks[0]).not.toHaveProperty("title");
});

it("edits the prompt while keeping other task fields", async () => {
  const tasks = [makeTask("TASK-edit", "Old prompt", { status: "doing", focus: "focus", priority: "high" })];
  await board(tasks);
  await screen.findByText("Old prompt");
  fireEvent.click(screen.getByRole("button", { name: /Old prompt/i }));
  expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Prompt" }), { target: { value: "New prompt\n\nDetails" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(tasks[0]).toMatchObject({ prompt: "New prompt\n\nDetails", status: "doing", priority: "high" }));
  expect((await screen.findAllByText("New prompt Details")).length).toBeGreaterThan(0);
});

it("preserves comma-bearing labels when only the prompt changes", async () => {
  const tasks = [makeTask("TASK-labels", "Old prompt", { status: "doing", focus: "focus", labels: ["release, v2", "docs"] })];
  await board(tasks);
  await screen.findByText("Old prompt");
  fireEvent.click(screen.getByRole("button", { name: /Old prompt/i }));
  fireEvent.change(screen.getByRole("textbox", { name: "Prompt" }), { target: { value: "New prompt" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(tasks[0]?.prompt).toBe("New prompt"));
  expect(tasks[0]?.labels).toEqual(["release, v2", "docs"]);
});

it("shows a selectable full task ID for prerequisite links", async () => {
  const id = "TASK-12345678-aaaa-bbbb-cccc-123456789abc";
  await board([makeTask(id, "Prerequisite", { status: "doing", focus: "focus" })]);
  await screen.findByText("Prerequisite");
  fireEvent.click(screen.getByRole("button", { name: /Prerequisite/i }));
  expect(screen.getByText(id).className).toContain("select-all");
});

it("shows off-page Focus work and lets an editor remove an unloaded prerequisite", async () => {
  const tasks = [makeTask("TASK-prereq", "Prerequisite", { status: "done" }),
    ...Array.from({ length: 205 }, (_, index) => makeTask(`TASK-backlog-${index}`, `Backlog ${index}`)),
    makeTask("TASK-focus", "Old focus needle", { status: "doing", focus: "focus", dependsOn: ["TASK-prereq"] })];
  await board(tasks);
  await screen.findByText("Old focus needle");
  fireEvent.click(screen.getByRole("button", { name: /Old focus needle/i }));
  const remove = await screen.findByRole("button", { name: /Remove prerequisite TASK-prereq/i });
  fireEvent.click(remove);
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(tasks.at(-1)?.dependsOn).toEqual([]));
});

it("keeps a draft during realtime updates and refuses to overwrite a newer revision", async () => {
  const tasks = [makeTask("TASK-1", "Existing", { status: "doing", focus: "focus" })];
  const slot = await board(tasks);
  await screen.findByText("Existing");
  fireEvent.click(screen.getByRole("button", { name: /Existing/i }));
  fireEvent.change(screen.getByRole("textbox", { name: "Prompt" }), { target: { value: "My draft" } });
  tasks[0].prompt = "Changed elsewhere";
  tasks[0].updatedAt = "2026-01-01T00:00:01.000Z";
  await slot.behavior.emitRealtime("tasks-changed", { projectId: "proj_one" });
  await screen.findByText(/changed elsewhere\. reload/i);
  expect(screen.getByRole("textbox", { name: "Prompt" })).toHaveProperty("value", "My draft");
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByRole("alert");
  expect(tasks[0]).toMatchObject({ prompt: "Changed elsewhere" });
  fireEvent.click(screen.getByRole("button", { name: "Reload details" }));
  expect(screen.getByRole("textbox", { name: "Prompt" })).toHaveProperty("value", "Changed elsewhere");
});

it("offers Start for a ready task and Open thread for an existing link", async () => {
  const tasks = [makeTask("TASK-ready", "Ready", { status: "doing", focus: "focus" }),
    makeTask("TASK-linked", "Linked", { status: "doing", focus: "focus", threadId: "thr_one" })];
  const slot = await board(tasks);
  await screen.findByText("Ready");
  fireEvent.click(screen.getByRole("button", { name: /Ready/i }));
  fireEvent.click(await screen.findByRole("button", { name: "Start" }));
  expect(slot.inspection.navigateCalls).toContainEqual({ method: "toPluginPanel", path: "tasks", options: { subPath: "start/TASK-ready" } });
  fireEvent.click(screen.getByRole("button", { name: /Linked/i }));
  fireEvent.click(await screen.findByRole("button", { name: "Open thread" }));
  expect(slot.inspection.navigateCalls).toContainEqual({ method: "toThread", threadId: "thr_one" });
  expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
});

it("explains an unfinished prerequisite even when the prerequisite is off-page", async () => {
  const tasks = [makeTask("TASK-prereq", "Unfinished prerequisite"),
    ...Array.from({ length: 205 }, (_, index) => makeTask(`TASK-backlog-${index}`, `Backlog ${index}`)),
    makeTask("TASK-focus", "Blocked focus", { status: "doing", focus: "focus", dependsOn: ["TASK-prereq"] })];
  await board(tasks);
  await screen.findByText("Blocked focus");
  fireEvent.click(screen.getByRole("button", { name: /Blocked focus/i }));
  expect(await screen.findByText(/Finish prerequisites before starting/i)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
});

it("loads a task directly by ID on its start route, regardless of the board page", async () => {
  const app = await loadPluginApp(() => import("./app"));
  const target = makeTask("TASK-off-page", "Work off page");
  const slot = renderSlot(app.navPanels[0]!, { subPath: "start/TASK-off-page" }, {
    rpc: { tasks_get: () => target, tasks_start_state: () => ({ canStart: true, reason: null, threadId: null, pending: false }) },
    context: { projectId: "proj_one", threadId: null },
  });
  unmount = () => slot.lifecycle.unmount();
  await screen.findByTestId("bb-new-thread-composer");
  expect(slot.inspection.rpcCalls).toContainEqual({ method: "tasks_get", input: { id: "TASK-off-page" } });
});

it("seeds BB's full composer and leaves the task unchanged when the user goes back", async () => {
  const app = await loadPluginApp(() => import("./app"));
  const task = makeTask("TASK-compose", "Original task prompt");
  const slot = renderSlot(app.navPanels[0]!, { subPath: "start/TASK-compose" }, {
    context: { projectId: "proj_two", threadId: null },
    rpc: { tasks_get: () => task, tasks_start_state: () => ({ canStart: true, reason: null, threadId: null, pending: false }) },
  });
  unmount = () => slot.lifecycle.unmount();
  const composer = await screen.findByTestId("bb-new-thread-composer");
  expect(composer.getAttribute("data-default-project-id")).toBe("proj_one");
  expect(composer.getAttribute("data-draft-key")).toBe("task-board:start:TASK-compose");
  expect(composer.getAttribute("data-layout")).toBe("document");
  const input = screen.getByTestId("bb-new-thread-composer-input");
  expect(input).toHaveProperty("value", "Original task prompt");
  fireEvent.change(input, { target: { value: "Edited but not submitted" } });
  fireEvent.click(screen.getByRole("button", { name: "Back to tasks" }));
  expect(slot.inspection.navigateCalls).toContainEqual({ method: "toPluginPanel", path: "tasks", options: undefined });
  expect(slot.inspection.rpcCalls.every((call) => call.method !== "tasks_start")).toBe(true);
  expect(task).toMatchObject({ status: "backlog", threadId: null, prompt: "Original task prompt" });
});

it("sends the edited composer draft and opens the newly linked thread", async () => {
  const app = await loadPluginApp(() => import("./app"));
  const task = makeTask("TASK-send", "Stored task prompt");
  const slot = renderSlot(app.navPanels[0]!, { subPath: "start/TASK-send" }, {
    context: { projectId: "proj_one", threadId: null },
    rpc: { tasks_get: () => task, tasks_start_state: () => ({ canStart: true, reason: null, threadId: null, pending: false }),
      tasks_start: () => ({ threadId: "thr_new" }) },
  });
  unmount = () => slot.lifecycle.unmount();
  const input = await screen.findByTestId("bb-new-thread-composer-input");
  fireEvent.change(input, { target: { value: "Edited work request" } });
  fireEvent.click(screen.getByTestId("bb-new-thread-composer-submit"));
  await waitFor(() => expect(slot.inspection.navigateCalls).toContainEqual({ method: "toThread", threadId: "thr_new" }));
  expect(slot.inspection.rpcCalls).toContainEqual({ method: "tasks_start", input: expect.objectContaining({
    id: "TASK-send", request: expect.objectContaining({ input: [{ type: "text", text: "Edited work request", mentions: [] }] }),
  }) });
  expect(task.prompt).toBe("Stored task prompt");
});

it("shows an existing task link on the start route without a second composer", async () => {
  const app = await loadPluginApp(() => import("./app"));
  const task = makeTask("TASK-linked", "Already started", { threadId: "thr_one" });
  const slot = renderSlot(app.navPanels[0]!, { subPath: "start/TASK-linked" }, {
    context: { projectId: "proj_one", threadId: null },
    rpc: { tasks_get: () => task, tasks_start_state: () => ({ canStart: false, reason: null, threadId: "thr_one", pending: false }) },
  });
  unmount = () => slot.lifecycle.unmount();
  fireEvent.click(await screen.findByRole("button", { name: "Open thread" }));
  expect(screen.queryByTestId("bb-new-thread-composer")).toBeNull();
  expect(slot.inspection.navigateCalls).toContainEqual({ method: "toThread", threadId: "thr_one" });
});

it("updates a pending start page when another tab links the thread", async () => {
  const app = await loadPluginApp(() => import("./app"));
  let linked = false;
  const task = makeTask("TASK-pending", "Work in progress");
  const slot = renderSlot(app.navPanels[0]!, { subPath: "start/TASK-pending" }, {
    context: { projectId: "proj_one", threadId: null },
    rpc: { tasks_get: () => ({ ...task, threadId: linked ? "thr_new" : null }),
      tasks_start_state: () => linked ? { canStart: false, reason: null, threadId: "thr_new", pending: false, active: false, launchToken: null }
        : { canStart: false, reason: "Thread start is pending", threadId: null, pending: true, active: false, launchToken: "claim_1" } },
  });
  unmount = () => slot.lifecycle.unmount();
  await screen.findByText("Thread start is pending");
  linked = true;
  await slot.behavior.emitRealtime("tasks-changed", { projectId: "proj_one" });
  fireEvent.click(await screen.findByRole("button", { name: "Open thread" }));
  expect(slot.inspection.navigateCalls).toContainEqual({ method: "toThread", threadId: "thr_new" });
  expect(screen.queryByTestId("bb-new-thread-composer")).toBeNull();
});

it("lets an operator recheck an unresolved launch without submitting again", async () => {
  const app = await loadPluginApp(() => import("./app"));
  let linked = false;
  const task = makeTask("TASK-recheck", "Pending work");
  const slot = renderSlot(app.navPanels[0]!, { subPath: "start/TASK-recheck" }, {
    context: { projectId: "proj_one", threadId: null },
    rpc: { tasks_get: () => task, tasks_start_state: () => linked
      ? { canStart: false, reason: null, threadId: "thr_found", pending: false, active: false, launchToken: null }
      : { canStart: false, reason: "Thread start is pending", threadId: null, pending: true, active: false, launchToken: "claim_1" } },
  });
  unmount = () => slot.lifecycle.unmount();
  await screen.findByText("Thread start is pending");
  linked = true;
  fireEvent.click(screen.getByRole("button", { name: "Recheck" }));
  expect(await screen.findByRole("button", { name: "Open thread" })).toBeTruthy();
  expect(slot.inspection.rpcCalls.every((call) => call.method !== "tasks_start")).toBe(true);
});

it("offers a recovery page from a pending task detail instead of a second Start", async () => {
  const task = makeTask("TASK-held", "Held work", { status: "doing", focus: "focus" });
  const slot = await board([task], () => ({ canStart: false, reason: "Thread start is pending",
    threadId: null, pending: true, active: false, launchToken: "claim_1" }));
  await screen.findByText("Held work");
  fireEvent.click(screen.getByRole("button", { name: /Held work/i }));
  fireEvent.click(await screen.findByRole("button", { name: "Review launch" }));
  expect(slot.inspection.navigateCalls).toContainEqual({ method: "toPluginPanel", path: "tasks", options: { subPath: "start/TASK-held" } });
  expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
});

it("hides manual recovery while the thread launch is still active", async () => {
  const app = await loadPluginApp(() => import("./app"));
  let active = true;
  const task = makeTask("TASK-active", "Wait for agent");
  const slot = renderSlot(app.navPanels[0]!, { subPath: "start/TASK-active" }, {
    context: { projectId: "proj_one", threadId: null },
    rpc: { tasks_get: () => task, tasks_start_state: () => ({ canStart: false, reason: "Thread start is pending",
      threadId: null, pending: true, active, launchToken: "claim_1" }) },
  });
  unmount = () => slot.lifecycle.unmount();
  await screen.findByText("Thread creation is still active.");
  expect(screen.queryByRole("button", { name: "Release claim" })).toBeNull();
  expect(screen.queryByRole("textbox", { name: "Known thread ID" })).toBeNull();
  active = false;
  await slot.behavior.emitRealtime("tasks-changed", { projectId: "proj_one" });
  expect(await screen.findByRole("textbox", { name: "Known thread ID" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Release claim" })).toBeTruthy();
});

it("links a known thread from the unresolved launch page without starting another", async () => {
  const app = await loadPluginApp(() => import("./app"));
  const task = makeTask("TASK-manual", "Link the work");
  let state: StartStateFixture = { canStart: false, reason: "Thread start is pending", threadId: null, pending: true, active: false, launchToken: "claim_1" };
  const slot = renderSlot(app.navPanels[0]!, { subPath: "start/TASK-manual" }, {
    context: { projectId: "proj_one", threadId: null },
    rpc: { tasks_get: () => task, tasks_start_state: () => state, tasks_resolve_launch: () => {
      task.threadId = "thr_one"; task.status = "doing"; task.focus = "focus";
      state = { canStart: false, reason: null, threadId: "thr_one", pending: false, active: false, launchToken: null };
      return state;
    } },
  });
  unmount = () => slot.lifecycle.unmount();
  const input = await screen.findByRole("textbox", { name: "Known thread ID" });
  fireEvent.change(input, { target: { value: "thr_one" } });
  fireEvent.click(screen.getByRole("button", { name: "Link thread" }));
  expect(await screen.findByRole("button", { name: "Open thread" })).toBeTruthy();
  expect(slot.inspection.rpcCalls).toContainEqual({ method: "tasks_resolve_launch", input: { id: task.id, expectedLaunchToken: "claim_1", action: "link", threadId: "thr_one" } });
  expect(slot.inspection.rpcCalls.every((call) => call.method !== "tasks_start")).toBe(true);
});

it("requires confirmation to release a claim and never auto-starts after release", async () => {
  const app = await loadPluginApp(() => import("./app"));
  const task = makeTask("TASK-release", "Retry deliberately");
  let state: StartStateFixture = { canStart: false, reason: "Thread start is pending", threadId: null, pending: true, active: false, launchToken: "claim_1" };
  const slot = renderSlot(app.navPanels[0]!, { subPath: "start/TASK-release" }, {
    context: { projectId: "proj_one", threadId: null },
    rpc: { tasks_get: () => task, tasks_start_state: () => state, tasks_resolve_launch: () => {
      state = { canStart: true, reason: null, threadId: null, pending: false, active: false, launchToken: null };
      return state;
    } },
  });
  unmount = () => slot.lifecycle.unmount();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  fireEvent.click(await screen.findByRole("button", { name: "Release claim" }));
  expect(slot.inspection.rpcCalls.some((call) => call.method === "tasks_resolve_launch")).toBe(false);
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Release claim" }));
  expect(await screen.findByTestId("bb-new-thread-composer")).toBeTruthy();
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(slot.inspection.rpcCalls).toContainEqual({ method: "tasks_resolve_launch", input: { id: task.id, expectedLaunchToken: "claim_1", action: "release", confirmed: true } });
  expect(slot.inspection.rpcCalls.every((call) => call.method !== "tasks_start")).toBe(true);
  expect(task).toMatchObject({ status: "backlog", threadId: null });
});
