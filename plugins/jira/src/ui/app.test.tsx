// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot, type CapturedPluginApp } from "@get-bb/plugin-sdk/testing/app";
import type { ThreadLinkResult, TicketList } from "../rpc";
import { TICKET_LIMIT } from "../tickets";


const ticket = (key: string, summary: string, status: string, threads: TicketList["tickets"][number]["threads"] = []) => ({
  key,
  summary,
  status,
  statusCategory: "indeterminate",
  issueType: "Story",
  url: `https://example.atlassian.net/browse/${key}`,
  threads,
});

const list = (overrides: Partial<TicketList> = {}): TicketList => ({
  tickets: [
    ticket("ABC-12", "Fix login", "In Progress", [
      { threadId: "thr_1", title: "Fix login thread", archived: false },
      { threadId: "thr_2", title: "Old attempt", archived: true },
    ]),
    ticket("ABC-40", "Add export", "To Do"),
  ],
  refreshedAt: Date.now() - 120_000,
  error: null,
  health: "ok",
  limitReached: false,
  refreshing: false,
  ...overrides,
});

type RpcHandlers = NonNullable<NonNullable<Parameters<typeof renderSlot>[2]>["rpc"]>;

let app: CapturedPluginApp;

beforeAll(async () => {
  app = await loadPluginApp(() => import("../../app"));
});

afterEach(() => cleanup());

function renderPage(rpc: RpcHandlers) {
  return renderSlot(app.navPanels[0]!, { subPath: "" }, { rpc, openUrl: () => true });
}

describe("Jira page", () => {
  it("shows a loading state until the list arrives", async () => {
    const slot = renderPage({ tickets: () => new Promise(() => {}) });

    expect(await slot.findByText("Loading tickets…")).toBeTruthy();
  });

  it("shows tickets with status, linked threads, and archived threads", async () => {
    const slot = renderPage({ tickets: () => list() });

    expect(await slot.findByText("Fix login")).toBeTruthy();
    expect(slot.getByText("In Progress")).toBeTruthy();
    expect(slot.getByText("Fix login thread")).toBeTruthy();
    expect(slot.getByText("(archived)")).toBeTruthy();
    expect(slot.getByText("Refreshed 2 min ago")).toBeTruthy();
    expect(slot.queryByLabelText("Threads for ABC-40")).toBeNull();
    expect(slot.getAllByRole("button", { name: "Start thread" })).toHaveLength(2);
  });

  it("opens a linked thread and the ticket in Jira", async () => {
    const slot = renderPage({ tickets: () => list() });

    const target1 = await slot.findByText("Fix login thread");
    await act(async () => target1.click());
    await act(async () => slot.getByRole("button", { name: "ABC-12" }).click());

    expect(slot.inspection.navigateCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ threadId: "thr_1" }),
        expect.objectContaining({ url: "https://example.atlassian.net/browse/ABC-12" }),
      ]),
    );
  });

  it("says when no ticket matches the query", async () => {
    const slot = renderPage({ tickets: () => list({ tickets: [] }) });

    expect(await slot.findByText("No tickets match the query.")).toBeTruthy();
  });

  it("keeps the last list and shows the error when a refresh failed", async () => {
    const slot = renderPage({ tickets: () => list({ error: "connection reset" }) });

    expect(await slot.findByText(/Refresh failed: connection reset/)).toBeTruthy();
    expect(slot.getByText(/Showing the list from 2 min ago/)).toBeTruthy();
    expect(slot.getByText("Fix login")).toBeTruthy();
  });

  it("tells the user to install acli when it is missing", async () => {
    const slot = renderPage({ tickets: () => list({ tickets: [], refreshedAt: null, health: "missing" }) });

    expect(await slot.findByText(/acli is not installed/)).toBeTruthy();
  });

  it("tells the user to log in when acli is logged out", async () => {
    const slot = renderPage({ tickets: () => list({ health: "loggedOut", error: "acli is not logged in" }) });

    expect(await slot.findByText(/acli jira auth login/)).toBeTruthy();
  });

  it("says when the list reached the limit", async () => {
    const slot = renderPage({ tickets: () => list({ limitReached: true }) });

    expect(await slot.findByText(new RegExp(`first ${TICKET_LIMIT} tickets`))).toBeTruthy();
  });

  it("refreshes now and shows the new list", async () => {
    let current = list();
    const refresh = vi.fn(() => {
      current = list({ tickets: [ticket("ABC-99", "Brand new", "To Do")], refreshedAt: Date.now() });
      return current;
    });
    const slot = renderPage({ tickets: () => current, refresh });

    const target2 = await slot.findByRole("button", { name: "Refresh" });
    await act(async () => target2.click());

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(await slot.findByText("Brand new")).toBeTruthy();
  });
});

describe("Start thread dialog", () => {
  const rpc = (startThread = vi.fn(() => ({ threadId: "thr_new" }))) => ({
    tickets: () => list(),
    projects: () => [
      { id: "P-1", name: "catalog" },
      { id: "P-2", name: "arbor" },
    ],
    ticket: () => ({ ...ticket("ABC-40", "Add export", "To Do"), description: "Export as CSV.", prompt: "Work on Jira ticket ABC-40: Add export\n\nExport as CSV." }),
    startThread,
  });

  async function openDialog(slot: ReturnType<typeof renderPage>) {
    const [, startExport] = await slot.findAllByRole("button", { name: "Start thread" });
    await act(async () => startExport!.click());
    return (await screen.findByLabelText("First prompt")) as HTMLTextAreaElement;
  }

  it("prefills the prompt from the ticket and needs a project before it starts", async () => {
    const slot = renderPage(rpc());

    const prompt = await openDialog(slot);

    await vi.waitFor(() => expect(prompt.value).toContain("Export as CSV."));
    const start = screen.getAllByRole("button", { name: "Start thread" }).at(-1) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
  });

  it("starts a linked thread with the edited prompt and opens it", async () => {
    const startThread = vi.fn(() => ({ threadId: "thr_new" }));
    const slot = renderPage(rpc(startThread));
    const prompt = await openDialog(slot);
    await vi.waitFor(() => expect(prompt.value).not.toBe(""));
    const project = (await screen.findByLabelText("Project")) as HTMLSelectElement;
    await vi.waitFor(() => expect(project.disabled).toBe(false));

    fireEvent.change(project, { target: { value: "P-2" } });
    fireEvent.change(prompt, { target: { value: "Only do the CSV part" } });
    await act(async () => (screen.getAllByRole("button", { name: "Start thread" }).at(-1) as HTMLButtonElement).click());

    expect(startThread).toHaveBeenCalledWith({ projectId: "P-2", key: "ABC-40", prompt: "Only do the CSV part" });
    await vi.waitFor(() => expect(slot.inspection.navigateCalls).toContainEqual(expect.objectContaining({ threadId: "thr_new" })));
  });

  it("starts nothing when cancelled", async () => {
    const startThread = vi.fn(() => ({ threadId: "thr_new" }));
    const slot = renderPage(rpc(startThread));
    await openDialog(slot);

    await act(async () => screen.getByRole("button", { name: "Cancel" }).click());

    expect(screen.queryByLabelText("First prompt")).toBeNull();
    expect(startThread).not.toHaveBeenCalled();
  });
});

describe("thread header", () => {
  const props = { threadId: "thr_1", projectId: "P-1", isCompactViewport: false };
  const linked: ThreadLinkResult = {
    issueKey: "ABC-12",
    ticket: { key: "ABC-12", summary: "Fix login", status: "In Progress", statusCategory: "indeterminate", issueType: "Bug", url: "https://example.atlassian.net/browse/ABC-12" },
    error: null,
  };
  const unlinked: ThreadLinkResult = { issueKey: null, ticket: null, error: null };

  function renderHeader(rpc: RpcHandlers) {
    return renderSlot(app.threadHeaderActions[0]!, props, { rpc, openUrl: () => true });
  }

  it("shows nothing while the link loads", () => {
    const slot = renderHeader({ threadLink: () => new Promise(() => {}) });

    expect(slot.container.textContent).toBe("");
  });

  it("shows the linked ticket key and status, and its details on click", async () => {
    const slot = renderHeader({ threadLink: () => linked });

    const target3 = await slot.findByRole("button", { name: "ABC-12 · In Progress" });
    await act(async () => target3.click());

    expect(await screen.findByText("ABC-12: Fix login")).toBeTruthy();
    await act(async () => screen.getByRole("button", { name: "Open in Jira" }).click());
    expect(slot.inspection.navigateCalls).toContainEqual(expect.objectContaining({ url: "https://example.atlassian.net/browse/ABC-12" }));
  });

  it("keeps the key and marks the status unknown when the ticket cannot be read", async () => {
    const slot = renderHeader({ threadLink: () => ({ issueKey: "XYZ-7", ticket: null, error: "Work item does not exist" }) });

    const target4 = await slot.findByRole("button", { name: "XYZ-7 · Status unknown" });
    await act(async () => target4.click());

    expect(await screen.findByText(/Could not read the ticket: Work item does not exist/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unlink" })).toBeTruthy();
  });

  it("unlinks a thread", async () => {
    let current = linked;
    const unlink = vi.fn(() => {
      current = unlinked;
      return { ok: true };
    });
    const slot = renderHeader({ threadLink: () => current, unlink });
    const target5 = await slot.findByRole("button", { name: "ABC-12 · In Progress" });
    await act(async () => target5.click());

    const target6 = await screen.findByRole("button", { name: "Unlink" });
    await act(async () => target6.click());

    expect(unlink).toHaveBeenCalledWith({ threadId: "thr_1" });
    expect(await slot.findByRole("button", { name: "Link Jira" })).toBeTruthy();
  });

  it("links a ticket picked from my list", async () => {
    let current = unlinked;
    const link = vi.fn(() => (current = linked));
    const slot = renderHeader({ threadLink: () => current, tickets: () => list(), link });
    const target7 = await slot.findByRole("button", { name: "Link Jira" });
    await act(async () => target7.click());

    const target8 = await screen.findByRole("button", { name: /ABC-12\s*Fix login/ });
    await act(async () => target8.click());

    expect(link).toHaveBeenCalledWith({ threadId: "thr_1", key: "ABC-12" });
    expect(await slot.findByRole("button", { name: "ABC-12 · In Progress" })).toBeTruthy();
  });

  it("links a typed key and shows the error of an unknown one", async () => {
    const link = vi.fn(() => {
      throw new Error("Work item NOPE-1 does not exist");
    });
    const slot = renderHeader({ threadLink: () => unlinked, tickets: () => list({ tickets: [] }), link });
    const target9 = await slot.findByRole("button", { name: "Link Jira" });
    await act(async () => target9.click());

    fireEvent.change(await screen.findByLabelText("Ticket key"), { target: { value: "NOPE-1" } });
    await act(async () => screen.getByRole("button", { name: "Link" }).click());

    expect(link).toHaveBeenCalledWith({ threadId: "thr_1", key: "NOPE-1" });
    expect(await screen.findByText("Work item NOPE-1 does not exist")).toBeTruthy();
  });
});
