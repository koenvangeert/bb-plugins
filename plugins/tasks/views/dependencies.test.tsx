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

function ref(number: number, status: Task["status"] = "todo") {
  return {
    id: `01HZZZZZZZZZZZZZZZZZZZZZT${number}`,
    key: `ABC-${number}`,
    title: `Task ${number}`,
    status,
  } satisfies TaskDependencyRef;
}

function task(
  number: number,
  links: { blockedBy?: TaskDependencyRef[]; blocks?: TaskDependencyRef[] } = {},
): Task {
  const blockedBy = links.blockedBy ?? [];
  const blocks = links.blocks ?? [];
  const open = (refs: TaskDependencyRef[]) =>
    refs.filter((r) => r.status !== "done" && r.status !== "canceled").length;
  return makeTask({
    ...ref(number),
    projectId: PROJECT_ID,
    number,
    position: number,
    blockedBy,
    blocks,
    openBlockerCount: open(blockedBy),
    openBlockedCount: open(blocks),
    blocked: open(blockedBy) > 0,
  });
}

function render(tasks: Task[], subPath: string) {
  return renderSlot(
    app.navPanels[0]!,
    { subPath },
    {
      rpc: {
        listProjects: () => ({ projects: [project] }),
        listFolders: () => ({ folders: [] }),
        listPresets: () => ({ presets: [] }),
        sidebarSummary: () => ({ projects: [] }),
        listLabels: () => ({ labels: [] }),
        listTasks: (raw) => {
          const input = rpcInput(raw);
          if (input.activeOnly === true) return { tasks: [], nextCursor: null };
          const shown = tasks.filter((t) =>
            input.dependency === "ready"
              ? !t.blocked
              : input.dependency === "blocked"
                ? t.blocked
                : true,
          );
          return { tasks: shown, nextCursor: null };
        },
        listTaskThreads: () => ({ taskThreads: [] }),
        listComments: () => ({ comments: [] }),
        listAttachments: () => ({ attachments: [] }),
      },
    },
  );
}

async function itemFor(slot: ReturnType<typeof render>, key: string) {
  await slot.findByText(key);
  const item = slot.container.querySelector(`[data-task-key="${key}"]`);
  if (item === null) throw new Error(`${key} not found`);
  return item as HTMLElement;
}

const tasks = [
  task(3, { blocks: [ref(5), ref(6), ref(7)] }),
  task(5, { blockedBy: [ref(3), ref(4), ref(2, "done")] }),
  task(8),
];

describe.each([
  ["list row", PROJECT_ID],
  ["board card", `${PROJECT_ID}?view=board`],
])("dependency badge on a %s", (_name, subPath) => {
  it("shows Blocked by N with the open blocker count", async () => {
    const slot = render(tasks, subPath);

    const item = await itemFor(slot, "ABC-5");

    expect(within(item).getByText("Blocked by 2")).toBeTruthy();
    expect(within(item).queryByText(/^Blocks/)).toBeNull();
  });

  it("shows Blocks N for a task that blocks open work", async () => {
    const slot = render(tasks, subPath);

    const item = await itemFor(slot, "ABC-3");

    expect(within(item).getByText("Blocks 3")).toBeTruthy();
    expect(within(item).queryByText(/^Blocked by/)).toBeNull();
  });

  it("shows no badge for a task with no links", async () => {
    const slot = render(tasks, subPath);

    const item = await itemFor(slot, "ABC-8");

    expect(within(item).queryByText(/^Blocked by|^Blocks/)).toBeNull();
  });
});

describe("dependency filter", () => {
  async function pick(slot: ReturnType<typeof render>, option: string) {
    fireEvent.pointerDown(
      await slot.findByRole("button", { name: /Dependencies/ }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(await slot.findByRole("menuitemcheckbox", { name: option }));
  }

  it("shows every task for All", async () => {
    const slot = render(tasks, PROJECT_ID);

    await itemFor(slot, "ABC-8");

    expect(slot.queryByText("ABC-3")).toBeTruthy();
    expect(slot.queryByText("ABC-5")).toBeTruthy();
  });

  it("shows only ready tasks for Ready and keeps the choice", async () => {
    const slot = render(tasks, PROJECT_ID);
    await itemFor(slot, "ABC-5");

    await pick(slot, "Ready");

    await waitFor(() => expect(slot.queryByText("ABC-5")).toBeNull());
    expect(slot.queryByText("ABC-3")).toBeTruthy();
    expect(slot.queryByText("ABC-8")).toBeTruthy();
    expect(
      slot.rpcCalls.some(
        (call) =>
          call.method === "listTasks" &&
          (call.input as { dependency?: string }).dependency === "ready",
      ),
    ).toBe(true);
    expect(window.localStorage.getItem("bb-tasks:list-preferences")).toContain(
      '"dependency":"ready"',
    );
  });

  it("shows only blocked tasks for Blocked", async () => {
    const slot = render(tasks, PROJECT_ID);
    await itemFor(slot, "ABC-5");

    await pick(slot, "Blocked");

    await waitFor(() => expect(slot.queryByText("ABC-3")).toBeNull());
    expect(slot.queryByText("ABC-8")).toBeNull();
    expect(slot.queryByText("ABC-5")).toBeTruthy();
  });
});
