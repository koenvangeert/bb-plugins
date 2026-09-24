// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { Task } from "../../shared/contract.js";
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

function baseTask(number: number): Task {
  return makeTask({
    id: `01HZZZZZZZZZZZZZZZZZZZZZT${number}`,
    projectId: PROJECT_ID,
    number,
    key: `ABC-${number}`,
    title: `Task ${number}`,
    position: number,
  });
}

function renderDetail(
  initialLinks: Array<[number, number]> = [],
  options: { cycleOn?: [number, number] } = {},
) {
  const base = [3, 4, 5].map(baseTask);
  const links = initialLinks.map(([a, b]) => [
    base.find((t) => t.number === a)!.id,
    base.find((t) => t.number === b)!.id,
  ]);
  const refOf = (id: string) => {
    const t = base.find((entry) => entry.id === id)!;
    return { id: t.id, key: t.key, title: t.title, status: t.status };
  };
  const withLinks = (t: Task): Task => {
    const blockedBy = links
      .filter(([, b]) => b === t.id)
      .map(([a]) => refOf(a!));
    const blocks = links
      .filter(([a]) => a === t.id)
      .map(([, b]) => refOf(b!));
    return {
      ...t,
      blockedBy,
      blocks,
      openBlockerCount: blockedBy.length,
      openBlockedCount: blocks.length,
      blocked: blockedBy.length > 0,
    };
  };
  const cycle = options.cycleOn?.map(
    (n) => base.find((t) => t.number === n)!.id,
  );
  return renderSlot(
    app.navPanels[0]!,
    { subPath: "task/ABC-5" },
    {
      rpc: {
        listProjects: () => ({
          projects: [
            {
              id: PROJECT_ID,
              name: "ABC project",
              prefix: "ABC",
              nextTaskNumber: 6,
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
        getTaskByKey: () => ({ task: withLinks(base[2]!) }),
        listTasks: (raw) =>
          rpcInput(raw).parentTaskId
            ? { tasks: [], nextCursor: null }
            : { tasks: base.map(withLinks), nextCursor: null },
        listLabels: () => ({ labels: [] }),
        listAttachments: () => ({ attachments: [] }),
        listTaskThreads: () => ({ taskThreads: [] }),
        listTaskPullRequests: () => ({
          pullRequests: [],
          unavailableThreadIds: [],
        }),
        listComments: () => ({ comments: [] }),
        addTaskDependency: (raw) => {
          const input = rpcInput(raw);
          if (
            cycle &&
            input.blockerTaskId === cycle[0] &&
            input.blockedTaskId === cycle[1]
          ) {
            return {
              ok: false,
              error: {
                code: "dependency_cycle",
                message:
                  "ABC-3 cannot block ABC-5: this makes a cycle (ABC-5 blocks ABC-3 blocks ABC-5)",
              },
            };
          }
          links.push([
            input.blockerTaskId as string,
            input.blockedTaskId as string,
          ]);
          const find = (id: unknown) =>
            withLinks(base.find((t) => t.id === id)!);
          return {
            ok: true,
            added: true,
            blocker: find(input.blockerTaskId),
            blocked: find(input.blockedTaskId),
          };
        },
        removeTaskDependency: (raw) => {
          const input = rpcInput(raw);
          const index = links.findIndex(
            ([a, b]) => a === input.blockerTaskId && b === input.blockedTaskId,
          );
          if (index >= 0) links.splice(index, 1);
          return { removed: index >= 0 };
        },
      },
    },
  );
}

async function section(slot: ReturnType<typeof renderDetail>, name: string) {
  return within(await slot.findByRole("region", { name }));
}

describe("task detail dependency sections", () => {
  it("adds a blocker from the picker", async () => {
    const slot = renderDetail();
    const blockedBy = await section(slot, "Blocked by");

    fireEvent.click(blockedBy.getByRole("button", { name: "Add blocker" }));
    fireEvent.click(await slot.findByRole("option", { name: /ABC-3/ }));

    await waitFor(() => expect(blockedBy.getByText("ABC-3")).toBeTruthy());
    expect(slot.rpcCalls).toContainEqual(
      expect.objectContaining({
        method: "addTaskDependency",
        input: {
          blockerTaskId: baseTask(3).id,
          blockedTaskId: baseTask(5).id,
        },
      }),
    );
  });

  it("adds a blocked task from the Blocks picker", async () => {
    const slot = renderDetail();
    const blocks = await section(slot, "Blocks");

    fireEvent.click(blocks.getByRole("button", { name: "Add blocked task" }));
    fireEvent.click(await slot.findByRole("option", { name: /ABC-4/ }));

    await waitFor(() => expect(blocks.getByText("ABC-4")).toBeTruthy());
  });

  it("removes a link", async () => {
    const slot = renderDetail([[3, 5]]);
    const blockedBy = await section(slot, "Blocked by");
    await blockedBy.findByText("ABC-3");

    fireEvent.click(
      blockedBy.getByRole("button", { name: "Remove ABC-3 from Blocked by" }),
    );

    await waitFor(() => expect(blockedBy.queryByText("ABC-3")).toBeNull());
  });

  it("opens a linked task on click", async () => {
    const slot = renderDetail([[3, 5]]);
    const blockedBy = await section(slot, "Blocked by");

    fireEvent.click(await blockedBy.findByText("Task 3"));

    await waitFor(() =>
      expect(slot.navigateCalls).toContainEqual({
        method: "toPluginPanel",
        path: "tasks",
        options: { subPath: "task/ABC-3" },
      }),
    );
  });

  it("shows the cycle error and keeps the sections", async () => {
    const slot = renderDetail([[5, 4]], { cycleOn: [3, 5] });
    const blockedBy = await section(slot, "Blocked by");

    fireEvent.click(blockedBy.getByRole("button", { name: "Add blocker" }));
    fireEvent.click(await slot.findByRole("option", { name: /ABC-3/ }));

    await slot.findByText(/this makes a cycle/);
    expect(blockedBy.queryByText("ABC-3")).toBeNull();
    expect((await section(slot, "Blocks")).getByText("ABC-4")).toBeTruthy();
  });
});
