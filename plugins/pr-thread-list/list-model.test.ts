import { describe, expect, it } from "vitest";
import { project, thread } from "./fixtures";
import { visibleItems, type ListOptions } from "./list-model";

const defaults: ListOptions = {
  mode: "project", lifecycles: ["active"], sort: "updated",
  direction: "desc", collapsedGroups: [], collapsedThreads: [],
};
const titles = (items: ReturnType<typeof visibleItems>) =>
  items.filter((item) => item.kind === "thread").map((item) => item.thread.displayTitle);

const rows = [
  thread({ id: "parent", displayTitle: "Parent", updatedAt: 300 }),
  thread({ id: "child", displayTitle: "Child", parentThreadId: "parent", updatedAt: 400 }),
  thread({ id: "pin", displayTitle: "Pin", isPinned: true, pinnedAt: 10, pinSortKey: "a" }),
  thread({ id: "hidden", displayTitle: "Hidden", isHidden: true }),
  thread({ id: "arch", displayTitle: "Archived", isArchived: true, archivedAt: 400 }),
];

describe("visibleItems", () => {
  it("places pinned rows once and nests children beneath the parent", () => {
    const items = visibleItems(rows, [project], [], defaults);
    expect(titles(items)).toEqual(["Pin", "Parent", "Child"]);
    expect(items.find((item) => item.kind === "thread" && item.thread.id === "child"))
      .toMatchObject({ depth: 1 });
    expect(items.filter((item) => item.kind === "thread" && item.thread.id === "pin")).toHaveLength(1);
  });

  it("hides descendants or groups when collapsed, and keeps hidden threads out", () => {
    expect(titles(visibleItems(rows, [project], [], { ...defaults, collapsedThreads: ["parent"] })))
      .toEqual(["Pin", "Parent"]);
    expect(titles(visibleItems(rows, [project], [], { ...defaults, collapsedGroups: ["project:p1"] })))
      .toEqual(["Pin"]);
  });

  it("groups by machine, projects, and custom sections with stable fallback", () => {
    const scoped = [thread({ id: "machine", host: { id: "m1", name: "Mac" }, sectionId: "s1" }),
      thread({ id: "loose", displayTitle: "Loose", projectId: "missing", updatedAt: 1 })];
    expect(visibleItems(scoped, [project], [], defaults).map((x) => x.kind === "group" ? x.label : x.thread.id))
      .toEqual(["Sample project", "machine", "Threads", "loose"]);
    expect(visibleItems(scoped, [project], [], { ...defaults, mode: "machine" })
      .some((x) => x.kind === "group" && x.label === "Mac")).toBe(true);
    expect(visibleItems(scoped, [project], [{ id: "s1", name: "Later", createdAt: 1, updatedAt: 1 }],
      { ...defaults, mode: "section" }).map((x) => x.kind === "group" ? x.label : x.thread.id))
      .toEqual(["Later", "machine", "Threads", "loose"]);
  });

  it("supports sorting and archive lifecycle without duplicating pinned children", () => {
    const items = visibleItems(rows, [project], [], { ...defaults, sort: "title", direction: "asc", lifecycles: ["active", "archived"] });
    expect(titles(items)).toContain("Archived");
    expect(titles(items)).not.toContain("Hidden");
    const pinnedChild = thread({ id: "pinnedChild", displayTitle: "Pinned child", parentThreadId: "parent", isPinned: true, pinnedAt: 11 });
    expect(titles(visibleItems([...rows, pinnedChild], [project], [], defaults)).filter((t) => t === "Pinned child")).toHaveLength(1);
  });
  it("retains empty sections for scoped creation and collapse", () => {
    const sections = [{ id: "s1", name: "Empty", createdAt: 1, updatedAt: 1 },
      { id: "s2", name: "Populated", createdAt: 2, updatedAt: 2 }];
    const items = visibleItems([thread({ sectionId: "s2" })], [project], sections, { ...defaults, mode: "section" });
    expect(items.filter((item) => item.kind === "group")).toMatchObject([
      { id: "section:s1", label: "Empty", count: 0 },
      { id: "section:s2", label: "Populated", count: 1 },
    ]);
    expect(visibleItems([], [project], sections, { ...defaults, mode: "section", collapsedGroups: ["section:s1"] }))
      .toMatchObject([{ kind: "group", id: "section:s1", count: 0, collapsed: true },
        { kind: "group", id: "section:s2", count: 0, collapsed: false }]);
  });
  it("derives thousands of rows without losing entries or mutating host arrays", () => {
    const many = Array.from({ length: 3000 }, (_, index) => thread({ id: `t${index}`,
      displayTitle: `Thread ${index}`, updatedAt: index }));
    const items = visibleItems(many, [project], [], defaults);
    expect(items[0]).toMatchObject({ kind: "group", count: 3000 });
    expect(items).toHaveLength(3001);
    expect(items[1]).toMatchObject({ kind: "thread", id: "t2999" });
    expect(many[0]?.id).toBe("t0");
  });
});
