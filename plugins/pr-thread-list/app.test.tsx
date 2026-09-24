// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { RenderSlotOptions } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThreadsState } from "@get-bb/plugin-sdk/app";
import type { PluginSidebarThreadRowStatus, PluginSidebarThreadShortcut, PluginThreadListProps } from "@get-bb/plugin-sdk/app";
import { project, thread } from "./fixtures";

const app = await loadPluginApp(() => import("./app"));
let mounted: ReturnType<typeof renderSlot> | undefined;
afterEach(() => { mounted?.lifecycle.unmount(); mounted = undefined; localStorage.clear(); });

function mount(threads = [thread()], state: Partial<PluginSidebarThreadsState> = {},
  extras: Partial<RenderSlotOptions> = {}, props: Partial<PluginThreadListProps> = {}) {
  const slot = app.threadLists[0]!;
  mounted = renderSlot(slot, {
    activeThreadId: null, activeProjectId: null, isCompactViewport: false,
    onNavigate: () => {}, searchQuery: "", ...props,
  }, { sidebarThreads: { threads, projects: [project], sections: [], ...state }, ...extras });
  return mounted;
}

describe("thread list slot", () => {
  it("registers one selectable list and renders a seeded thread", () => {
    expect(app.threadLists).toHaveLength(1);
    expect(app.threadLists[0]?.title).toBe("Threads with PRs");
    expect(mount().getByRole("link", { name: /Prepare release/ }).getAttribute("href"))
      .toBe("/projects/p1/threads/t1");
  });
  it("stores options and collapsed groups across remounts", () => {
    const first = mount();
    fireEvent.change(first.getByLabelText("Group by"), { target: { value: "machine" } });
    fireEvent.change(first.getByLabelText("Threads"), { target: { value: "both" } });
    fireEvent.change(first.getByLabelText("Sort by"), { target: { value: "title" } });
    first.lifecycle.unmount();
    mounted = undefined;
    const second = mount();
    expect((second.getByLabelText("Group by") as HTMLSelectElement).value).toBe("machine");
    expect((second.getByLabelText("Threads") as HTMLSelectElement).value).toBe("both");
    expect((second.getByLabelText("Sort by") as HTMLSelectElement).value).toBe("title");
    fireEvent.click(second.getByRole("button", { name: "Collapse Threads" }));
    expect(second.queryByRole("link", { name: /Prepare release/ })).toBeNull();
    second.lifecycle.unmount();
    mounted = undefined;
    const third = mount();
    expect(third.queryByRole("link", { name: /Prepare release/ })).toBeNull();
    fireEvent.click(third.getByRole("button", { name: "Reset list preferences" }));
    expect((third.getByLabelText("Group by") as HTMLSelectElement).value).toBe("project");
  });
  it("pages archived threads and handles loading, errors, emptiness and exhaustion", () => {
    const fetchNextPage = vi.fn().mockResolvedValue(undefined);
    const page = { status: "ready" as const, hasNextPage: true, isFetchingNextPage: false,
      isFetchNextPageError: false, fetchNextPage };
    const first = mount([thread({ isArchived: true })], { experimental_archived: page });
    fireEvent.change(first.getByLabelText("Threads"), { target: { value: "archived" } });
    expect(first.getByRole("link", { name: /Prepare release/ })).toBeTruthy();
    fireEvent.click(first.getByRole("button", { name: "Show more" }));
    expect(fetchNextPage).toHaveBeenCalledOnce();
    first.lifecycle.unmount();
    const loading = mount([], { experimental_archived: { ...page, status: "loading", isFetchingNextPage: true } });
    fireEvent.change(loading.getByLabelText("Threads"), { target: { value: "archived" } });
    expect(loading.getByRole("status").textContent).toContain("Loading archived");
    expect(loading.queryByRole("button", { name: "Show more" })).toBeNull();
    loading.lifecycle.unmount();
    const error = mount([], { experimental_archived: { ...page, status: "error", isFetchNextPageError: true } });
    fireEvent.change(error.getByLabelText("Threads"), { target: { value: "archived" } });
    expect(error.getByRole("alert").textContent).toContain("Archived threads");
    fireEvent.click(error.getByRole("button", { name: "Retry archive" }));
    expect(fetchNextPage).toHaveBeenCalledTimes(2);
    error.lifecycle.unmount();
    const initialError = mount([], { status: "error", experimental_archived: { ...page, status: "error", hasNextPage: false } });
    fireEvent.change(initialError.getByLabelText("Threads"), { target: { value: "archived" } });
    fireEvent.click(initialError.getByRole("button", { name: "Retry archive" }));
    expect(fetchNextPage).toHaveBeenCalledTimes(3);
    initialError.lifecycle.unmount();
    const empty = mount([], { experimental_archived: { ...page, hasNextPage: false } });
    fireEvent.change(empty.getByLabelText("Threads"), { target: { value: "archived" } });
    expect(empty.getByText("No threads")).toBeTruthy();
    expect(empty.queryByRole("button", { name: "Show more" })).toBeNull();
  });
  it("windows large lists and excludes offscreen and collapsed PR consumers", () => {
    const rows = Array.from({ length: 240 }, (_, index) => thread({ id: `t${index}`,
      displayTitle: `Thread ${index}`, updatedAt: 240 - index }));
    const slot = mount(rows);
    expect(slot.queryAllByTestId("pr-hook-consumer").length).toBeLessThan(40);
    expect(slot.queryByRole("link", { name: "Thread 180" })).toBeNull();
    const scroller = slot.getByTestId("thread-scroll");
    scroller.scrollTop = 32 * 180;
    fireEvent.scroll(scroller);
    expect(slot.getByRole("link", { name: "Thread 180" })).toBeTruthy();
    scroller.scrollTop = 0;
    fireEvent.scroll(scroller);
    fireEvent.click(slot.getByRole("button", { name: "Collapse Sample project" }));
    expect(slot.queryAllByTestId("pr-hook-consumer")).toHaveLength(0);
  });
  it("shows activity, selected/unread, draft or plugin status, and shortcut cues", () => {
    const busy = thread({ status: "active", runtimeStatus: "active", isUnread: true,
      indicator: "waiting-for-input", indicatorLabel: "Thread needs user input", queuedWork: "waiting",
      activity: { workflows: 2, backgroundAgents: 1, backgroundCommands: 0, planMode: 0, goals: 0 },
    });
    const slot = mount([busy], {}, { sidebarDraftThreadIds: ["t1"],
      sidebarRowStatuses: { t1: { icon: "Clock", label: "Scheduled", tone: "running" } },
      sidebarShortcuts: { t1: { label: "⌘1", ariaKeyshortcuts: "Meta+1" } },
    }, { activeThreadId: "t1" });
    const link = slot.getByRole("link", { name: /Prepare release/ });
    expect(link.getAttribute("aria-current")).toBe("page");
    expect(link.getAttribute("aria-keyshortcuts")).toBe("Meta+1");
    expect(link.className).toContain("font-semibold");
    expect(slot.getByLabelText("Thread needs user input")).toBeTruthy();
    expect(slot.getByLabelText("Scheduled")).toBeTruthy();
    expect(slot.queryByLabelText("Unsent draft")).toBeNull();
    expect(slot.getByText("⌘1")).toBeTruthy();
    expect(slot.getByLabelText("Thread active")).toBeTruthy();
    expect(slot.getByLabelText("2 workflows, 1 background agent")).toBeTruthy();
  });
  it("shows a draft when no plugin row status replaces it", () => {
    const slot = mount([thread()], {}, { sidebarDraftThreadIds: ["t1"] });
    expect(slot.getByLabelText("Unsent draft")).toBeTruthy();
  });
  it("routes row menu actions through BB and reorders pinned threads", () => {
    const rename = vi.spyOn(window, "prompt").mockReturnValue("Renamed");
    const sdk = { threads: { reorderPinned: vi.fn(async () => ({} as never)),
      unarchive: vi.fn(async () => ({} as never)), update: vi.fn(async () => ({} as never)) } };
    const pinned = [thread({ id: "t1", isPinned: true, pinnedAt: 10, pinSortKey: "a" }),
      thread({ id: "t2", displayTitle: "Second", isPinned: true, pinnedAt: 9, pinSortKey: "b" })];
    const slot = mount(pinned, {}, { sdk });
    const open = () => fireEvent.click(slot.getByRole("button", { name: "Actions for Prepare release" }));
    open(); fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    expect(sdk.threads.reorderPinned).toHaveBeenCalledWith({ threadId: "t1", previousThreadId: "t2", nextThreadId: null });
    open(); fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(rename).toHaveBeenCalled();
    expect(slot.inspection.sidebarActionCalls).toContainEqual({ method: "rename", threadId: "t1", title: "Renamed" });
    open(); fireEvent.click(screen.getByRole("menuitem", { name: "Mark unread" }));
    expect(slot.inspection.sidebarActionCalls).toContainEqual({ method: "setRead", threadId: "t1", read: false });
    open(); fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    expect(slot.inspection.sidebarActionCalls).toContainEqual({ method: "archive", threadId: "t1" });
    open(); fireEvent.click(screen.getByRole("menuitem", { name: "Delete…" }));
    expect(slot.inspection.sidebarActionCalls).toContainEqual({ method: "requestDelete", threadId: "t1" });
    rename.mockRestore();
  });
  it("uses public SDK operations for section changes and unarchiving", () => {
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("Later renamed");
    const sdk = { threads: { update: vi.fn(async () => ({} as never)), unarchive: vi.fn(async () => ({} as never)) },
      threadSections: { create: vi.fn(async () => ({} as never)), update: vi.fn(async () => ({} as never)) } };
    const slot = mount([thread({ isArchived: true })], {
      sections: [{ id: "s1", name: "Later", createdAt: 1, updatedAt: 1 }],
    }, { sdk });
    fireEvent.change(slot.getByLabelText("Threads"), { target: { value: "both" } });
    fireEvent.change(slot.getByLabelText("Group by"), { target: { value: "section" } });
    fireEvent.click(slot.getByRole("button", { name: "Actions for Prepare release" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to Later" }));
    expect(sdk.threads.update).toHaveBeenCalledWith({ threadId: "t1", sectionId: "s1" });
    fireEvent.click(slot.getByRole("button", { name: "Actions for Prepare release" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Unarchive" }));
    expect(sdk.threads.unarchive).toHaveBeenCalledWith({ threadId: "t1" });
    fireEvent.click(slot.getByRole("button", { name: "Create section" }));
    expect(sdk.threadSections.create).toHaveBeenCalledWith({ name: "Later renamed" });
    prompt.mockRestore();
  });
  it("offers section group creation, rename and a scoped new-thread action", () => {
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("Renamed section");
    const sdk = { threadSections: { update: vi.fn(async () => ({} as never)) } };
    const slot = mount([], { sections: [{ id: "s1", name: "Later", createdAt: 1, updatedAt: 1 }] }, { sdk });
    fireEvent.change(slot.getByLabelText("Group by"), { target: { value: "section" } });
    const open = () => fireEvent.click(slot.getByRole("button", { name: "More for Later" }));
    open(); fireEvent.click(screen.getByRole("menuitem", { name: "Rename section" }));
    expect(sdk.threadSections.update).toHaveBeenCalledWith({ id: "s1", name: "Renamed section" });
    open(); fireEvent.click(screen.getByRole("menuitem", { name: "New thread" }));
    expect(slot.inspection.sidebarActionCalls).toContainEqual({ method: "openNewThread", options: { sectionId: "s1", focusPrompt: true } });
    prompt.mockRestore();
  });
  it("keeps native link semantics, keyboard targets, split drag and compact navigation", () => {
    const onNavigate = vi.fn();
    const slot = mount([thread()], {}, {}, { isCompactViewport: true, onNavigate });
    const link = slot.getByRole("link", { name: /Prepare release/ });
    expect(link.getAttribute("href")).toBe("/projects/p1/threads/t1");
    expect(link.hasAttribute("data-sidebar-thread-shortcut-target")).toBe(true);
    expect(link.getAttribute("data-sidebar-thread-id")).toBe("t1");
    fireEvent.click(link);
    expect(slot.inspection.sidebarActionCalls).toContainEqual({ method: "open", threadId: "t1" });
    expect(onNavigate).toHaveBeenCalledOnce();
    const preventModifiedNavigation = (event: MouseEvent) => { if (event.metaKey) event.preventDefault(); };
    document.addEventListener("click", preventModifiedNavigation);
    fireEvent.click(link, { metaKey: true });
    document.removeEventListener("click", preventModifiedNavigation);
    expect(onNavigate).toHaveBeenCalledOnce();
    fireEvent.pointerDown(link);
    expect(slot.inspection.sidebarActionCalls.filter((call) => call.method === "open")).toHaveLength(2);
    fireEvent.click(slot.getByRole("button", { name: "Actions for Prepare release" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open in split" }));
    expect(slot.inspection.sidebarActionCalls).toContainEqual({ method: "open", threadId: "t1", options: { split: true } });
  });
  it("renders a linked PR badge without opening the thread", () => {
    const onNavigate = vi.fn();
    const slot = mount([thread()], {}, { sidebarPullRequests: {
      t1: { number: 42, title: "Ship it", url: "https://example.com/pull/42", state: "open", attention: "checks_failed" },
    } }, { onNavigate });
    const pr = slot.getByRole("link", { name: "PR #42: checks failed" });
    expect(pr.getAttribute("href")).toBe("https://example.com/pull/42");
    expect(pr.textContent).toContain("#42");
    expect(pr.textContent).toContain("Failed");
    fireEvent.click(pr);
    expect(slot.inspection.sidebarActionCalls).toHaveLength(0);
    expect(onNavigate).not.toHaveBeenCalled();
  });
  it("shows one environment PR on both visible threads and none on an unrelated row", () => {
    const environment = { id: "e1", name: "Worktree", branchName: "feature", path: "/tmp/feature",
      isWorktree: true, providerId: null, workspaceDisplayKind: null };
    const shared = { number: 42, title: "Ship it", url: "https://example.com/pull/42",
      state: "open" as const, attention: "review_requested" as const };
    const slot = mount([thread({ id: "t1", environment }),
      thread({ id: "t2", displayTitle: "Second", environment }),
      thread({ id: "t3", displayTitle: "No PR" })], {}, { sidebarPullRequests: { t1: shared, t2: shared } });
    expect(slot.getAllByRole("link", { name: "PR #42: review requested" })).toHaveLength(2);
    expect(slot.queryByRole("link", { name: /PR #3/ })).toBeNull();
    expect(slot.getByRole("link", { name: "No PR" })).toBeTruthy();
  });
});
