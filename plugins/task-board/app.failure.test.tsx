// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { Task } from "./server";

// The SDK test composer calls onSubmit with `void`, unlike BB's real composer,
// which handles rejected submissions. Catch it here to exercise that host boundary.
vi.mock("@get-bb/plugin-sdk/app", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@get-bb/plugin-sdk/app")>();
  const React = await import("react");
  return {
    ...actual,
    experimental_NewThreadComposer: ({ onSubmit, initialPrompt, defaultProjectId }: {
      onSubmit: (request: unknown) => Promise<void> | void; initialPrompt?: string; defaultProjectId?: string;
    }) => {
      const [text, setText] = React.useState(initialPrompt ?? "");
      const [project, setProject] = React.useState(defaultProjectId ?? "");
      return React.createElement("div", {},
        React.createElement("textarea", { "aria-label": "Composer draft", value: text, onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => setText(event.target.value) }),
        React.createElement("select", { "aria-label": "Composer project", value: project, onChange: (event: React.ChangeEvent<HTMLSelectElement>) => setProject(event.target.value) },
          React.createElement("option", { value: "proj_one" }, "One"), React.createElement("option", { value: "proj_two" }, "Two")),
        React.createElement("button", { onClick: () => {
          void Promise.resolve(onSubmit({ projectId: project, providerId: "codex", model: "gpt-5", reasoningLevel: "medium",
            permissionMode: "auto", executionInputSources: {}, environment: { type: "project-default" }, input: [{ type: "text", text, mentions: [] }] })).catch(() => {});
        } }, "Start thread"),
      );
    },
  };
});

let unmount: (() => void) | undefined;
afterEach(() => { unmount?.(); unmount = undefined; });

it("shows a rejected project submission and leaves the editable draft available", async () => {
  const task: Task = { id: "TASK-reject", projectId: "proj_one", prompt: "Original", priority: "normal", status: "backlog",
    focus: null, labels: [], dependsOn: [], threadId: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
  const app = await loadPluginApp(() => import("./app"));
  const slot = renderSlot(app.navPanels[0]!, { subPath: "start/TASK-reject" }, {
    context: { projectId: "proj_one", threadId: null },
    rpc: { tasks_get: () => task, tasks_start_state: () => ({ canStart: true, reason: null, threadId: null, pending: false, active: false, launchToken: null }),
      tasks_start: ({ request }: { request: { projectId: string } }) => {
        if (request.projectId !== task.projectId) throw new Error("Thread must start in the task's project");
        return { threadId: "thr_unexpected" };
      } },
  });
  unmount = () => slot.lifecycle.unmount();
  const input = await screen.findByRole("textbox", { name: "Composer draft" });
  fireEvent.change(input, { target: { value: "Edited draft stays" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Composer project" }), { target: { value: "proj_two" } });
  fireEvent.click(screen.getByRole("button", { name: "Start thread" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Thread must start in the task's project");
  expect(input).toHaveProperty("value", "Edited draft stays");
  expect(slot.inspection.rpcCalls).toContainEqual({ method: "tasks_start", input: { id: task.id, request: expect.objectContaining({ projectId: "proj_two" }) } });
  expect(slot.inspection.navigateCalls).toEqual([]);
});
