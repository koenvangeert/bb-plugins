// @vitest-environment jsdom
import { cleanup, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { Task, TaskDependencyRef } from "../../shared/contract.js";
import { makeTask, rpcInput } from "../../test-fixtures.js";

window.matchMedia ??= (query: string) => ({
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

afterEach(cleanup);

const PROJECT_ID = "01HZZZZZZZZZZZZZZZZZZZZZP1";

function task(number: number, overrides: Partial<Task> = {}): Task {
  return makeTask({
    id: `01HZZZZZZZZZZZZZZZZZZZZZT${number}`,
    projectId: PROJECT_ID,
    number,
    key: `ABC-${number}`,
    title: `Task ${number}`,
    position: number,
    ...overrides,
  });
}

function ref(number: number, status: Task["status"]): TaskDependencyRef {
  return {
    id: `01HZZZZZZZZZZZZZZZZZZZZZT${number}`,
    key: `ABC-${number}`,
    title: `Task ${number}`,
    status,
  };
}

function renderParent(subtasks: () => Task[]) {
  const parent = task(1);
  return renderSlot(
    app.navPanels[0]!,
    { subPath: "task/ABC-1" },
    {
      rpc: {
        listProjects: () => ({
          projects: [
            {
              id: PROJECT_ID,
              name: "ABC project",
              prefix: "ABC",
              nextTaskNumber: 10,
              color: "blue",
              folderId: null,
              linkedBbProjectId: null,
              createdAt: "2026-07-15T00:00:00.000Z",
            },
          ],
        }),
        listFolders: () => ({ folders: [] }),
        listPresets: () => ({ presets: [] }),
        sidebarSummary: () => ({ projects: [] }),
        getTaskByKey: () => ({ task: parent }),
        listTasks: (raw) =>
          rpcInput(raw).parentTaskId
            ? { tasks: subtasks(), nextCursor: null }
            : { tasks: [parent], nextCursor: null },
        listLabels: () => ({ labels: [] }),
        listAttachments: () => ({ attachments: [] }),
        listTaskThreads: () => ({ taskThreads: [] }),
        listTaskPullRequests: () => ({
          pullRequests: [],
          unavailableThreadIds: [],
        }),
        listComments: () => ({ comments: [] }),
      },
    },
  );
}

async function subtaskRow(slot: ReturnType<typeof renderParent>, key: string) {
  const row = (await slot.findByText(key)).closest("button");
  return within(row!);
}

const blockedSubtask = task(2, {
  parentTaskId: task(1).id,
  blockedBy: [ref(7, "todo")],
  openBlockerCount: 1,
  blocked: true,
});
const blockingSubtask = task(3, {
  parentTaskId: task(1).id,
  blocks: [ref(8, "todo"), ref(9, "in_progress")],
  openBlockedCount: 2,
});
const plainSubtask = task(4, { parentTaskId: task(1).id });

describe("sub-task rows in the parent detail view", () => {
  it("show dependency badges per sub-task", async () => {
    const slot = renderParent(() => [
      blockedSubtask,
      blockingSubtask,
      plainSubtask,
    ]);

    expect(
      (await subtaskRow(slot, "ABC-2")).getByText("Blocked by 1"),
    ).toBeTruthy();
    expect(
      (await subtaskRow(slot, "ABC-3")).getByText("Blocks 2"),
    ).toBeTruthy();
    const plain = await subtaskRow(slot, "ABC-4");
    expect(plain.queryByText(/Blocked by|Blocks/)).toBeNull();
  });

  it("drop the blocked badge when the blocker is done", async () => {
    let current = blockedSubtask;
    const slot = renderParent(() => [current]);
    expect(
      (await subtaskRow(slot, "ABC-2")).getByText("Blocked by 1"),
    ).toBeTruthy();

    current = {
      ...blockedSubtask,
      blockedBy: [ref(7, "done")],
      openBlockerCount: 0,
      blocked: false,
    };
    await slot.emitRealtime("tasks:changed", {
      taskId: ref(7, "done").id,
      projectId: PROJECT_ID,
    });

    await waitFor(async () =>
      expect(
        (await subtaskRow(slot, "ABC-2")).queryByText("Blocked by 1"),
      ).toBeNull(),
    );
  });
});
