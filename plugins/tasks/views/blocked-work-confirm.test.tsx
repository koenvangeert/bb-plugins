// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { Task, TaskDependencyRef } from "../shared/contract.js";
import { makeTask, rpcInput } from "../test-fixtures.js";

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

const app = await loadPluginApp(() => import("../app"));

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

const PROJECT_ID = "01HZZZZZZZZZZZZZZZZZZZZZP1";
const PRESET_ID = "01HZZZZZZZZZZZZZZZZZZZZZR1";

function ref(number: number, status: Task["status"] = "todo") {
  return {
    id: `01HZZZZZZZZZZZZZZZZZZZZZT${number}`,
    key: `ABC-${number}`,
    title: `Task ${number}`,
    status,
  } satisfies TaskDependencyRef;
}

function task(number: number, blockedBy: TaskDependencyRef[] = []): Task {
  const open = blockedBy.filter(
    (r) => r.status !== "done" && r.status !== "canceled",
  ).length;
  return makeTask({
    ...ref(number),
    projectId: PROJECT_ID,
    number,
    position: number,
    blockedBy,
    blocks: [],
    openBlockerCount: open,
    openBlockedCount: 0,
    blocked: open > 0,
  });
}

const blocked = task(5, [ref(3), ref(4, "in_review"), ref(2, "done")]);
const ready = task(8, [ref(2, "done")]);

function render(subPath: string, detailTask: Task = blocked) {
  const tasks = [blocked, ready];
  return renderSlot(
    app.navPanels[0]!,
    { subPath },
    {
      rpc: {
        listProjects: () => ({
          projects: [
            {
              id: PROJECT_ID,
              name: "ABC project",
              prefix: "ABC",
              nextTaskNumber: 9,
              color: "blue",
              folderId: null,
              linkedBbProjectId: null,
              createdAt: "2026-07-15T00:00:00.000Z",
            },
          ],
        }),
        listFolders: () => ({ folders: [] }),
        listPresets: () => ({
          presets: [
            {
              id: PRESET_ID,
              name: "Worker",
              providerId: "claude",
              modelId: "opus",
              reasoningLevel: "default",
              serviceTier: null,
              permissionMode: "default",
              environmentKind: "local",
              baseBranch: null,
              machineId: null,
              instructions: "",
              builtin: false,
              createdAt: "2026-07-15T00:00:00.000Z",
            },
          ],
        }),
        sidebarSummary: () => ({ projects: [] }),
        listLabels: () => ({ labels: [] }),
        getTaskByKey: () => ({ task: detailTask }),
        listTasks: (raw) =>
          rpcInput(raw).activeOnly === true || rpcInput(raw).parentTaskId
            ? { tasks: [], nextCursor: null }
            : { tasks, nextCursor: null },
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
        boardMove: (raw) => {
          const input = rpcInput(raw);
          const current = tasks.find((t) => t.id === input.taskId)!;
          return { ok: true, task: { ...current, status: input.status } };
        },
        delegate: () => ({ threadId: "thr_worker" }),
      },
    },
  );
}

type Slot = ReturnType<typeof render>;

function called(slot: Slot, method: string): boolean {
  return slot.rpcCalls.some((call) => call.method === method);
}

async function confirmDialog(slot: Slot) {
  return within(await slot.findByRole("dialog", { name: /is blocked/ }));
}

async function expectListedBlockers(slot: Slot) {
  const dialog = await confirmDialog(slot);
  expect(dialog.getByText("ABC-5 is blocked")).toBeTruthy();
  const keys = [
    ...document.querySelectorAll<HTMLElement>("[data-blocker-key]"),
  ].map((item) => item.dataset.blockerKey);
  expect(keys).toEqual(["ABC-3", "ABC-4"]);
}

async function itemFor(slot: Slot, key: string) {
  await slot.findByText(key);
  const item = slot.container.querySelector(`[data-task-key="${key}"]`);
  if (item === null) throw new Error(`${key} not found`);
  return item as HTMLElement;
}

async function pickListStatus(slot: Slot, key: string) {
  const row = await itemFor(slot, key);
  fireEvent.pointerDown(
    within(row).getByRole("button", { name: /Change status, currently Todo/ }),
    { button: 0, ctrlKey: false },
  );
  fireEvent.click(await slot.findByRole("menuitem", { name: /In Progress/ }));
}

function layOutBoardColumns() {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const columns = [...document.querySelectorAll("[data-board-column]")];
    const index = columns.indexOf(this);
    const left = index >= 0 ? index * 300 : 0;
    const width = index >= 0 ? 230 : 3000;
    return DOMRect.fromRect({ x: left, y: 0, width, height: 1000 });
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

async function dragToInProgress(slot: Slot, key: string) {
  const card = await itemFor(slot, key);
  const column = slot.container.querySelector(
    '[data-board-column="in_progress"]',
  )!;
  const columns = [...slot.container.querySelectorAll("[data-board-column]")];
  const x = columns.indexOf(column) * 300 + 100;
  fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(window, { clientX: x, clientY: 500 });
  fireEvent.pointerUp(window, { clientX: x, clientY: 500 });
}

async function openDetailStatus(slot: Slot) {
  const [trigger] = await slot.findAllByRole("button", { name: "Todo" });
  fireEvent.pointerDown(trigger!, { button: 0, ctrlKey: false });
  fireEvent.click(await slot.findByRole("menuitem", { name: /In Progress/ }));
}

async function dispatch(slot: Slot) {
  const [button] = await slot.findAllByRole("button", { name: "Worker" });
  fireEvent.click(button!);
}

describe("blocked work confirm in the list status menu", () => {
  it("asks and lists the open blockers", async () => {
    const slot = render(PROJECT_ID);

    await pickListStatus(slot, "ABC-5");

    await expectListedBlockers(slot);
    expect(called(slot, "updateTask")).toBe(false);
  });

  it("keeps the old status on cancel", async () => {
    const slot = render(PROJECT_ID);
    await pickListStatus(slot, "ABC-5");

    fireEvent.click((await confirmDialog(slot)).getByText("Cancel"));

    await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
    expect(called(slot, "updateTask")).toBe(false);
    expect(
      within(await itemFor(slot, "ABC-5")).getByRole("button", {
        name: /currently Todo/,
      }),
    ).toBeTruthy();
  });

  it("saves the status on Start anyway", async () => {
    const slot = render(PROJECT_ID);
    await pickListStatus(slot, "ABC-5");

    fireEvent.click((await confirmDialog(slot)).getByText("Start anyway"));

    await waitFor(() =>
      expect(slot.rpcCalls).toContainEqual(
        expect.objectContaining({
          method: "updateTask",
          input: expect.objectContaining({ status: "in_progress" }),
        }),
      ),
    );
  });

  it("does not ask for a ready task", async () => {
    const slot = render(PROJECT_ID);

    await pickListStatus(slot, "ABC-8");

    await waitFor(() => expect(called(slot, "updateTask")).toBe(true));
    expect(slot.queryByRole("dialog", { name: /is blocked/ })).toBeNull();
  });
});

describe("blocked work confirm on a board drop", () => {
  let restore: () => void;
  beforeEach(() => {
    restore = layOutBoardColumns();
  });
  afterEach(() => restore());

  it("asks, and moves nothing on cancel", async () => {
    const slot = render(`${PROJECT_ID}?view=board`);

    await dragToInProgress(slot, "ABC-5");
    await expectListedBlockers(slot);
    fireEvent.click((await confirmDialog(slot)).getByText("Cancel"));

    await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
    expect(called(slot, "boardMove")).toBe(false);
    expect(
      within(
        slot.container.querySelector('[data-board-column="todo"]')!,
      ).getByText("ABC-5"),
    ).toBeTruthy();
  });

  it("moves the card on Start anyway", async () => {
    const slot = render(`${PROJECT_ID}?view=board`);

    await dragToInProgress(slot, "ABC-5");
    fireEvent.click((await confirmDialog(slot)).getByText("Start anyway"));

    await waitFor(() =>
      expect(slot.rpcCalls).toContainEqual(
        expect.objectContaining({
          method: "boardMove",
          input: expect.objectContaining({ status: "in_progress" }),
        }),
      ),
    );
  });

  it("does not ask for a ready task", async () => {
    const slot = render(`${PROJECT_ID}?view=board`);

    await dragToInProgress(slot, "ABC-8");

    await waitFor(() => expect(called(slot, "boardMove")).toBe(true));
    expect(slot.queryByRole("dialog", { name: /is blocked/ })).toBeNull();
  });
});

describe("blocked work confirm in the task detail", () => {
  it("asks before a status change and keeps the status on cancel", async () => {
    const slot = render("task/ABC-5");

    await openDetailStatus(slot);
    await expectListedBlockers(slot);
    fireEvent.click((await confirmDialog(slot)).getByText("Cancel"));

    await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
    expect(called(slot, "updateTask")).toBe(false);
  });

  it("saves the status on Start anyway", async () => {
    const slot = render("task/ABC-5");

    await openDetailStatus(slot);
    fireEvent.click((await confirmDialog(slot)).getByText("Start anyway"));

    await waitFor(() => expect(called(slot, "updateTask")).toBe(true));
  });

  it("asks before dispatch and dispatches on Start anyway", async () => {
    const slot = render("task/ABC-5");

    await dispatch(slot);
    await expectListedBlockers(slot);
    expect(called(slot, "delegate")).toBe(false);
    fireEvent.click((await confirmDialog(slot)).getByText("Start anyway"));

    await waitFor(() => expect(called(slot, "delegate")).toBe(true));
  });

  it("dispatches a ready task without asking", async () => {
    const slot = render("task/ABC-8", ready);

    await dispatch(slot);

    await waitFor(() => expect(called(slot, "delegate")).toBe(true));
    expect(slot.queryByRole("dialog", { name: /is blocked/ })).toBeNull();
  });
});
