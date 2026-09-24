import type { PluginSidebarProject, PluginSidebarSection, PluginSidebarThread } from "@get-bb/plugin-sdk/app";

export type Organization = "project" | "machine" | "section";
export type Lifecycle = "active" | "archived";
export type SortField = "updated" | "created" | "title";
export interface ListOptions {
  mode: Organization;
  lifecycles: readonly Lifecycle[];
  sort: SortField;
  direction: "asc" | "desc";
  collapsedGroups: readonly string[];
  collapsedThreads: readonly string[];
}
export type ListItem =
  | { kind: "group"; id: string; label: string; count: number; collapsed: boolean }
  | { kind: "thread"; id: string; thread: PluginSidebarThread; depth: number; hasChildren: boolean; collapsed: boolean };

const busy = (thread: PluginSidebarThread) =>
  thread.status === "starting" || thread.status === "active" || thread.status === "stopping";

function compare(a: PluginSidebarThread, b: PluginSidebarThread, options: ListOptions): number {
  if (a.isPinned && b.isPinned) {
    if (a.pinSortKey !== null || b.pinSortKey !== null) {
      if (a.pinSortKey === null) return 1;
      if (b.pinSortKey === null) return -1;
      if (a.pinSortKey !== b.pinSortKey) return a.pinSortKey.localeCompare(b.pinSortKey);
    }
    if (a.pinnedAt !== b.pinnedAt) return (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0);
  }
  if (options.sort === "updated" && busy(a) !== busy(b)) return busy(a) ? -1 : 1;
  const value = options.sort === "title"
    ? a.displayTitle.localeCompare(b.displayTitle)
    : a[options.sort === "created" ? "createdAt" : "updatedAt"] -
      b[options.sort === "created" ? "createdAt" : "updatedAt"];
  return (options.direction === "asc" ? value : -value) || a.id.localeCompare(b.id);
}

/** One stable, flattened tree for rendering and windowing. Never mutates host rows. */
export function visibleItems(
  threads: readonly PluginSidebarThread[],
  projects: readonly PluginSidebarProject[],
  sections: readonly PluginSidebarSection[],
  options: ListOptions,
): ListItem[] {
  const filtered = threads.filter((t) => !t.isHidden && options.lifecycles.includes(t.isArchived ? "archived" : "active"));
  const byId = new Map(filtered.map((t) => [t.id, t]));
  const projectNames = new Map(projects.map((p) => [p.id, p.name]));
  const sectionNames = new Map(sections.map((s) => [s.id, s.name]));
  const pinnedCache = new Map<string, boolean>();
  const belongsToPinned = (thread: PluginSidebarThread): boolean => {
    const seen = new Set<string>();
    const path: string[] = [];
    let cursor: PluginSidebarThread | undefined = thread;
    let pinned = false;
    while (cursor && !seen.has(cursor.id)) {
      const cached = pinnedCache.get(cursor.id);
      if (cached !== undefined) { pinned = cached; break; }
      path.push(cursor.id);
      if (cursor.isPinned) { pinned = true; break; }
      seen.add(cursor.id);
      cursor = cursor.parentThreadId ? byId.get(cursor.parentThreadId) : undefined;
    }
    for (const id of path) pinnedCache.set(id, pinned);
    return pinned;
  };
  const groupOf = (thread: PluginSidebarThread): string => {
    if (belongsToPinned(thread)) return "pinned";
    if (options.mode === "section") return thread.sectionId && sectionNames.has(thread.sectionId) ? `section:${thread.sectionId}` : "threads";
    if (options.mode === "machine") return thread.host ? `machine:${thread.host.id}` : "threads";
    return projectNames.has(thread.projectId) ? `project:${thread.projectId}` : "threads";
  };
  const groups = new Map<string, PluginSidebarThread[]>();
  const sectionOrder = new Map(sections.map((section, index) => [`section:${section.id}`, index]));
  if (options.mode === "section") for (const section of sections) groups.set(`section:${section.id}`, []);
  for (const thread of filtered) {
    const key = groupOf(thread);
    let bucket = groups.get(key);
    if (!bucket) { bucket = []; groups.set(key, bucket); }
    bucket.push(thread);
  }
  const groupOrder = [...groups.keys()].sort((a, b) => {
    if (a === "pinned" || b === "pinned") return a === "pinned" ? -1 : 1;
    if (a === "threads" || b === "threads") return a === "threads" ? 1 : -1;
    if (options.mode === "section") return (sectionOrder.get(a) ?? 0) - (sectionOrder.get(b) ?? 0);
    const label = (key: string) => key.startsWith("project:") ? projectNames.get(key.slice(8)) : groups.get(key)?.[0]?.host?.name;
    return (label(a) ?? a).localeCompare(label(b) ?? b);
  });
  const result: ListItem[] = [];
  for (const key of groupOrder) {
    const bucket = groups.get(key)!;
    const label = key === "pinned" ? "Pinned" : key === "threads" ? "Threads"
      : key.startsWith("project:") ? projectNames.get(key.slice(8)) ?? "Threads"
      : key.startsWith("section:") ? sectionNames.get(key.slice(8)) ?? "Threads"
      : bucket[0]?.host?.name ?? "Threads";
    const collapsed = options.collapsedGroups.includes(key);
    result.push({ kind: "group", id: key, label, count: bucket.length, collapsed });
    if (collapsed) continue;
    const members = new Map(bucket.map((t) => [t.id, t]));
    const children = new Map<string, PluginSidebarThread[]>();
    const roots: PluginSidebarThread[] = [];
    for (const thread of bucket) {
      const parent = thread.parentThreadId && members.get(thread.parentThreadId);
      if (parent && parent.id !== thread.id && !(thread.isPinned && key === "pinned")) {
        let siblings = children.get(parent.id);
        if (!siblings) { siblings = []; children.set(parent.id, siblings); }
        siblings.push(thread);
      } else roots.push(thread);
    }
    const visited = new Set<string>();
    const append = (thread: PluginSidebarThread, depth: number): void => {
      if (visited.has(thread.id)) return;
      visited.add(thread.id);
      const descendants = children.get(thread.id) ?? [];
      const folded = options.collapsedThreads.includes(thread.id);
      result.push({ kind: "thread", id: thread.id, thread, depth, hasChildren: descendants.length > 0, collapsed: folded });
      if (folded) {
        const stack = [...descendants];
        while (stack.length > 0) {
          const child = stack.pop()!;
          if (visited.has(child.id)) continue;
          visited.add(child.id);
          stack.push(...(children.get(child.id) ?? []));
        }
      } else {
        for (const child of descendants.sort((a, b) => compare(a, b, options))) append(child, depth + 1);
      }
    };
    for (const root of roots.sort((a, b) => compare(a, b, options))) append(root, 0);
    // Malformed/cyclic parent references should not make a navigable thread disappear.
    for (const thread of bucket) if (!visited.has(thread.id)) append(thread, 0);
  }
  return result;
}
