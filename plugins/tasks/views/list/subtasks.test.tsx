// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { Task } from "../../shared/contract.js";
import { makeTask, rpcInput } from "../../test-fixtures.js";
import { EXPANDED_TASKS_STORAGE_KEY } from "./expanded-tasks.js";
import {
  LIST_PREFERENCE_STORAGE_KEY,
  type ListPreference,
} from "./list-preference.js";

window.matchMedia = (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
});
window.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView ??= () => {};

const app = await loadPluginApp(() => import("../../app"));

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

const PROJECT_ID = "01HZZZZZZZZZZZZZZZZZZZZZP1";

const project = {
  id: PROJECT_ID,
  name: "ABC project",
  prefix: "ABC",
  nextTaskNumber: 9,
  color: "blue",
  folderId: null,
  linkedBbProjectId: null,
  createdAt: "2026-07-15T00:00:00.000Z",
};

function id(number: number) {
  return `01HZZZZZZZZZZZZZZZZZZZZZT${number}`;
}

function task(number: number, overrides: Partial<Task> = {}): Task {
  return makeTask({
    id: id(number),
    projectId: PROJECT_ID,
    number,
    key: `ABC-${number}`,
    title: `Task ${number}`,
    position: number,
    ...overrides,
  });
}

const parent = task(1, { status: "in_progress" });
const doneChild = task(2, {
  status: "done",
  priority: "low",
  parentTaskId: id(1),
});
const urgentChild = task(3, {
  status: "todo",
  priority: "urgent",
  parentTaskId: id(1),
});
const plain = task(4, { status: "todo" });

function serverFilter(tasks: Task[], input: Record<string, unknown>) {
  const statuses = input.statuses as string[] | undefined;
  return tasks.filter(
    (t) =>
      (statuses === undefined || statuses.includes(t.status)) &&
      (input.dependency === undefined ||
        (input.dependency === "blocked") === (t.blocked ?? false)),
  );
}

function render(tasks: Task[]) {
  return renderSlot(
    app.navPanels[0]!,
    { subPath: PROJECT_ID },
    {
      rpc: {
        listProjects: () => ({ projects: [project] }),
        listFolders: () => ({ folders: [] }),
        listPresets: () => ({ presets: [] }),
        sidebarSummary: () => ({ projects: [] }),
        listLabels: () => ({ labels: [] }),
        listTasks: (raw) => ({
          tasks: serverFilter(tasks, rpcInput(raw)),
          nextCursor: null,
        }),
        getTaskByKey: (raw) => ({
          task: tasks.find((t) => t.key === rpcInput(raw).taskKey) ?? null,
        }),
        listTaskThreads: () => ({ taskThreads: [] }),
        listTaskPullRequests: () => ({
          pullRequests: [],
          unavailableThreadIds: [],
        }),
        listComments: () => ({ comments: [] }),
        listAttachments: () => ({ attachments: [] }),
        updateTask: (raw) => {
          const input = rpcInput(raw);
          const current = tasks.find((t) => t.id === input.taskId)!;
          return { ok: true, task: { ...current, ...input } };
        },
      },
    },
  );
}

function preset(
  preference: Partial<ListPreference["filters"]>,
  sort = "manual",
) {
  window.localStorage.setItem(
    LIST_PREFERENCE_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      scopes: {
        [`project:${PROJECT_ID}`]: {
          filters: {
            statuses: [],
            priorities: [],
            labelNames: [],
            ...preference,
          },
          sort,
        },
      },
    }),
  );
}

function presetExpanded(ids: string[]) {
  window.localStorage.setItem(
    EXPANDED_TASKS_STORAGE_KEY,
    JSON.stringify({ version: 1, scopes: { [`project:${PROJECT_ID}`]: ids } }),
  );
}

async function rowFor(slot: ReturnType<typeof render>, key: string) {
  await slot.findByText(key);
  const row = slot.container.querySelector(`[data-task-key="${key}"]`);
  if (row === null) throw new Error(`row ${key} not found`);
  return row as HTMLElement;
}

function rowKeys(slot: ReturnType<typeof render>) {
  return Array.from(slot.container.querySelectorAll("[data-task-key]")).map(
    (row) => row.getAttribute("data-task-key"),
  );
}

function groupKeys(slot: ReturnType<typeof render>, status: string) {
  const header = slot.container.querySelector(
    `[data-status-group-header="${status}"]`,
  );
  const section = header?.closest("section");
  if (!section) return null;
  return Array.from(section.querySelectorAll("[data-task-key]")).map((row) =>
    row.getAttribute("data-task-key"),
  );
}

const all = [parent, doneChild, urgentChild, plain];

describe("subtasks in the list", () => {
  it("collapses parents by default and shows the done count", async () => {
    const slot = render(all);
    const row = await rowFor(slot, "ABC-1");

    expect(within(row).getByText("1/2")).toBeTruthy();
    expect(
      within(row).getByRole("button", { name: "Expand subtasks of ABC-1" }),
    ).toBeTruthy();
    expect(rowKeys(slot)).toEqual(["ABC-4", "ABC-1"]);
  });

  it("shows no chevron and no done count for a task without subtasks", async () => {
    const slot = render(all);
    const row = await rowFor(slot, "ABC-4");

    expect(
      within(row).queryByRole("button", { name: /subtasks of/ }),
    ).toBeNull();
    expect(within(row).queryByText(/^\d+\/\d+$/)).toBeNull();
  });

  it("expands on chevron click without opening the task, keeping subtasks in the parent group", async () => {
    const slot = render(all);
    const row = await rowFor(slot, "ABC-1");

    fireEvent.click(
      within(row).getByRole("button", { name: "Expand subtasks of ABC-1" }),
    );

    await slot.findByText("ABC-2");
    expect(groupKeys(slot, "in_progress")).toEqual(["ABC-1", "ABC-2", "ABC-3"]);
    expect(groupKeys(slot, "done")).toBeNull();
    expect(
      within(await rowFor(slot, "ABC-2")).getByRole("button", {
        name: /Change status, currently Done/,
      }),
    ).toBeTruthy();
    expect(slot.navigateCalls).toEqual([]);
  });

  it("opens a subtask on click", async () => {
    presetExpanded([id(1)]);
    const slot = render(all);
    await rowFor(slot, "ABC-2");

    fireEvent.click(slot.getByRole("button", { name: "Open ABC-2: Task 2" }));

    expect(slot.navigateCalls).toContainEqual({
      method: "toPluginPanel",
      path: "tasks",
      options: { subPath: "task/ABC-2" },
    });
  });

  it("sorts subtasks with the list sort", async () => {
    presetExpanded([id(1)]);
    preset({}, "priority");
    const slot = render(all);
    await rowFor(slot, "ABC-2");

    expect(groupKeys(slot, "in_progress")).toEqual(["ABC-1", "ABC-3", "ABC-2"]);
  });

  it("keeps an expand toggle after a reload", async () => {
    const slot = render(all);
    fireEvent.click(
      within(await rowFor(slot, "ABC-1")).getByRole("button", {
        name: "Expand subtasks of ABC-1",
      }),
    );
    await slot.findByText("ABC-2");
    slot.lifecycle.unmount();

    const reloaded = render(all);

    await reloaded.findByText("ABC-2");
    expect(rowKeys(reloaded)).toEqual(["ABC-4", "ABC-1", "ABC-2", "ABC-3"]);
  });

  it("follows an optimistic subtask status edit in the done count", async () => {
    presetExpanded([id(1)]);
    const slot = render(all);
    const child = await rowFor(slot, "ABC-3");

    fireEvent.pointerDown(
      within(child).getByRole("button", {
        name: /Change status, currently Todo/,
      }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(await slot.findByRole("menuitem", { name: /Done/ }));

    await waitFor(() =>
      expect(
        within(
          slot.container.querySelector('[data-task-key="ABC-1"]')!,
        ).getByText("2/2"),
      ).toBeTruthy(),
    );
  });

  it("loads only the list query without a filter", async () => {
    const slot = render(all);
    await rowFor(slot, "ABC-1");

    const calls = slot.rpcCalls
      .filter((call) => call.method === "listTasks")
      .map((call) => rpcInput(call.input));
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((input) => !("parentTaskId" in input))).toBe(true);
    expect(calls.every((input) => input.activeOnly === false)).toBe(true);
  });
});

describe("subtasks with a filter", () => {
  const readyParent = task(1, { status: "todo", blocked: false });
  const blockedChild = task(3, {
    status: "todo",
    parentTaskId: id(1),
    blocked: true,
  });
  const readyChild = task(5, {
    status: "done",
    parentTaskId: id(1),
    blocked: false,
  });
  const filtered = [readyParent, blockedChild, readyChild, task(4)];

  it("shows a dimmed, expanded parent when only a subtask matches", async () => {
    preset({ dependency: "blocked" });
    const slot = render(filtered);
    const row = await rowFor(slot, "ABC-1");

    expect(row.getAttribute("data-dimmed")).toBe("true");
    expect(
      within(row).getByRole("button", { name: "Collapse subtasks of ABC-1" }),
    ).toBeTruthy();
    expect(within(row).getByText("1/2")).toBeTruthy();
    expect(rowKeys(slot)).toEqual(["ABC-1", "ABC-3"]);
    expect(
      slot.container.querySelector('[data-status-group-header="todo"]')
        ?.textContent,
    ).toContain("1");
    expect(slot.getByText("1 task")).toBeTruthy();
  });

  it("loads the matches and the unfiltered scope", async () => {
    preset({ dependency: "blocked" });
    const slot = render(filtered);
    await rowFor(slot, "ABC-1");

    const calls = slot.rpcCalls
      .filter((call) => call.method === "listTasks")
      .map((call) => rpcInput(call.input));
    expect(calls.some((input) => input.dependency === "blocked")).toBe(true);
    expect(
      calls.some(
        (input) => !("dependency" in input) && !("activeOnly" in input),
      ),
    ).toBe(true);
  });

  it("does not save a toggle made under a filter", async () => {
    preset({ dependency: "blocked" });
    const slot = render(filtered);
    const row = await rowFor(slot, "ABC-1");

    fireEvent.click(
      within(row).getByRole("button", { name: "Collapse subtasks of ABC-1" }),
    );

    await waitFor(() => expect(slot.queryByText("ABC-3")).toBeNull());
    expect(window.localStorage.getItem(EXPANDED_TASKS_STORAGE_KEY)).toBeNull();
  });

  it("shows a matching parent at full strength without non-matching subtasks", async () => {
    preset({ statuses: ["todo"] });
    const slot = render([
      readyParent,
      task(2, { status: "done", parentTaskId: id(1) }),
    ]);
    const row = await rowFor(slot, "ABC-1");

    expect(row.getAttribute("data-dimmed")).toBeNull();
    expect(
      within(row).queryByRole("button", { name: /subtasks of/ }),
    ).toBeNull();
    expect(rowKeys(slot)).toEqual(["ABC-1"]);
  });

  it("hides a parent when neither it nor its subtasks match", async () => {
    preset({ statuses: ["in_review"] });
    const slot = render(filtered);

    await slot.findByText("No tasks match these filters");
    expect(rowKeys(slot)).toEqual([]);
  });
});
