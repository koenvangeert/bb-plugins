import { useEffect, useMemo, useRef, useState } from "react";
import {
  definePluginApp, experimental_Icon as Icon, experimental_useSidebarThreads, experimental_useSidebarThreadPullRequest,
  experimental_useSidebarThreadSplit,
  experimental_useSidebarThreadActions, useSdk,
  useSidebarThreadDraft, useSidebarThreadRowStatus, useSidebarThreadShortcut,
  type PluginBrowserBbSdk, type PluginSidebarSection, type PluginSidebarThread, type PluginSidebarThreadActions, type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { ActionMenu } from "./action-menu";
import { createSection, groupMenuItems, threadMenuItems } from "./thread-actions";
import { PrBadgeView } from "./pr-badge";
import { visibleItems, type Lifecycle, type ListItem, type ListOptions, type Organization, type SortField } from "./list-model";
import { DEFAULT_PREFERENCES, readPreferences, savePreferences } from "./preferences";
import { describeActivity, describeIndicator } from "./row-cues";

const ROW_HEIGHT = 32;
const OVERSCAN = 5;

/** One opt-in host lookup for each mounted, visible row. */
function PullRequestConsumer({ threadId }: { threadId: string }) {
  const facts = experimental_useSidebarThreadPullRequest(threadId);
  return <PrBadgeView {...facts} />;
}

function ThreadRow({ item, activeThreadId, onToggle, onNavigate, actions, sdk, sections, pinned }: {
  item: Extract<ListItem, { kind: "thread" }>;
  activeThreadId: string | null;
  onToggle: (id: string) => void;
  onNavigate: () => void;
  actions: PluginSidebarThreadActions;
  sdk: PluginBrowserBbSdk;
  sections: readonly PluginSidebarSection[];
  pinned: readonly PluginSidebarThread[];
}) {
  const { thread } = item;
  const { hasUnsubmittedDraft } = useSidebarThreadDraft(thread.id);
  const rowStatus = useSidebarThreadRowStatus(thread.id);
  const shortcut = useSidebarThreadShortcut(thread.id);
  const { splitProps, isAvailable: splitAvailable } = experimental_useSidebarThreadSplit(thread.id);
  const indicator = describeIndicator(thread);
  const activity = describeActivity(thread);
  const active = thread.status === "active" || thread.status === "starting" || thread.status === "stopping";
  const selected = thread.id === activeThreadId;
  return (
    <div className="flex h-8 min-w-0 items-center" style={{ paddingLeft: `${item.depth * 12}px` }}>
      {item.hasChildren ? <button type="button" aria-label={`${item.collapsed ? "Expand" : "Collapse"} ${thread.displayTitle}`}
        aria-expanded={!item.collapsed} className="shrink-0 px-1 text-muted-foreground"
        onClick={() => onToggle(item.id)}>{item.collapsed ? "▸" : "▾"}</button> : null}
      <a {...splitProps} href={thread.href} data-sidebar-thread-shortcut-target="" data-sidebar-thread-id={thread.id}
        aria-current={selected ? "page" : undefined} aria-keyshortcuts={shortcut?.ariaKeyshortcuts}
        onClick={(event) => {
          if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          actions.open(thread.id);
          onNavigate();
        }}
        className={`flex h-8 min-w-0 flex-1 items-center truncate rounded-md px-2 hover:bg-accent ${selected ? "bg-accent" : ""} ${thread.isUnread ? "font-semibold" : ""}`}>
        <span className="truncate">{thread.displayTitle}</span>
      </a>
      {active ? <span role="img" aria-label={`Thread ${thread.runtimeStatus}`} title={`Thread ${thread.runtimeStatus}`}
        className="shrink-0 text-primary">●</span> : null}
      {activity ? <span role="img" aria-label={activity} title={activity}
        className="shrink-0 px-0.5 text-xs text-muted-foreground">↻</span> : null}
      {indicator ? <span role="img" aria-label={indicator} title={indicator}
        className="shrink-0 px-0.5 text-muted-foreground">●</span> : null}
      {thread.queuedWork !== "none" && !thread.indicator.startsWith("queued-") ?
        <span role="img" aria-label={thread.queuedWork === "failed" ? "Queued message failed" : "Queued message waiting"}
          className="shrink-0 text-muted-foreground">◷</span> : null}
      {rowStatus ? <span role="img" aria-label={rowStatus.label} title={rowStatus.label}
        className={`shrink-0 ${rowStatus.tone === "error" ? "text-destructive" : "text-muted-foreground"}`}>
        <Icon name={rowStatus.icon} className="size-3.5" aria-hidden />
      </span> : hasUnsubmittedDraft && thread.indicator !== "draft" && thread.indicator !== "working-draft" ?
        <span role="img" aria-label="Unsent draft" title="Unsent draft" className="shrink-0 text-muted-foreground">✎</span> : null}
      {shortcut ? <span className="shrink-0 rounded border border-border px-1 text-xs text-muted-foreground">{shortcut.label}</span> : null}
      <ActionMenu label={`Actions for ${thread.displayTitle}`}
        items={threadMenuItems(thread, actions, sdk, sections, pinned, splitAvailable, onNavigate)} />
      <PullRequestConsumer threadId={thread.id} />
    </div>
  );
}

function ThreadList(_props: PluginThreadListProps) {
  const [prefs, setPrefs] = useState(readPreferences);
  const { status, threads, projects, sections, experimental_archived: archived } = experimental_useSidebarThreads({ experimental_lifecycles: prefs.lifecycles });
  const actions = experimental_useSidebarThreadActions();
  const sdk = useSdk();
  const pinned = useMemo(() => threads.filter((row) => row.isPinned && !row.isHidden && !row.isArchived)
    .sort((a, b) => a.pinSortKey === b.pinSortKey ? (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0)
      : a.pinSortKey === null ? 1 : b.pinSortKey === null ? -1 : a.pinSortKey.localeCompare(b.pinSortKey)), [threads]);
  const items = useMemo(() => visibleItems(threads, projects, sections, prefs), [threads, projects, sections, prefs]);
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const measure = () => setViewportHeight(node.clientHeight || 600);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const windowSize = Math.ceil(viewportHeight / ROW_HEIGHT) + 2 * OVERSCAN;
  const start = Math.max(0, Math.min(items.length - windowSize, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN));
  const end = Math.min(items.length, start + windowSize);
  const windowItems = items.slice(start, end);
  useEffect(() => savePreferences(prefs), [prefs]);
  const update = (change: Partial<ListOptions>) => setPrefs((current) => ({ ...current, ...change }));
  const toggle = (field: "collapsedGroups" | "collapsedThreads", id: string) => {
    setPrefs((current) => ({ ...current,
      [field]: current[field].includes(id) ? current[field].filter((entry) => entry !== id) : [...current[field], id],
    }));
  };
  const lifecycles = prefs.lifecycles.join(",") === "active,archived" ? "both" : prefs.lifecycles[0];
  const showArchive = prefs.lifecycles.includes("archived");
  const archiveLoading = showArchive && archived?.status === "loading";
  const archiveError = showArchive && archived?.status === "error";
  return (
    <div className="flex h-full min-h-0 flex-col p-2 text-sm text-foreground">
      <div className="mb-2 shrink-0 space-y-1 border-b border-border pb-2">
        <label className="flex items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
          Threads
          <select aria-label="Threads" value={lifecycles} className="min-w-0 rounded border border-border bg-background px-1 py-1 text-foreground"
            onChange={(event) => update({ lifecycles: event.target.value === "both" ? ["active", "archived"] : [event.target.value as Lifecycle] })}>
            <option value="active">Active</option><option value="archived">Archived</option><option value="both">Both</option>
          </select>
        </label>
        <details className="px-1 text-xs">
          <summary className="cursor-pointer text-muted-foreground">List options</summary>
          <div className="space-y-2 py-2">
            <label className="flex items-center justify-between gap-2">Group by
              <select aria-label="Group by" value={prefs.mode} className="rounded border border-border bg-background px-1 py-1"
                onChange={(event) => update({ mode: event.target.value as Organization })}>
                <option value="project">Project</option><option value="machine">Machine</option><option value="section">Section</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-2">Sort by
              <select aria-label="Sort by" value={prefs.sort} className="rounded border border-border bg-background px-1 py-1"
                onChange={(event) => update({ sort: event.target.value as SortField })}>
                <option value="updated">Last updated</option><option value="created">Created</option><option value="title">Title</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-2">Direction
              <select aria-label="Direction" value={prefs.direction} className="rounded border border-border bg-background px-1 py-1"
                onChange={(event) => update({ direction: event.target.value as ListOptions["direction"] })}>
                <option value="desc">Descending</option><option value="asc">Ascending</option>
              </select>
            </label>
            <button type="button" className="text-muted-foreground underline" onClick={() => setPrefs(DEFAULT_PREFERENCES)}>
              Reset list preferences
            </button>
          </div>
        </details>
        {prefs.mode === "section" ? <button type="button" className="px-1 text-xs text-muted-foreground underline"
          onClick={() => { void createSection(sdk)?.catch(() => toast.error("Could not create section.")); }}>
          Create section
        </button> : null}
      </div>
      <div ref={scroller} data-testid="thread-scroll" className="min-h-0 flex-1 overflow-y-auto"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
      {status === "loading" ? <p role="status">Loading threads…</p> : null}
      {status === "error" ? <p role="alert">Threads are unavailable.</p> : null}
      {archiveLoading ? <p role="status" className="p-2 text-muted-foreground">Loading archived threads…</p> : null}
      {archiveError ? <p role="alert" className="p-2 text-destructive">Archived threads are unavailable.</p> : null}
      {status === "ready" && !archiveLoading && !archiveError && items.length === 0 ? <p className="p-2 text-muted-foreground">No threads</p> : null}
      {status === "ready" ? <div aria-hidden="true" style={{ height: start * ROW_HEIGHT }} /> : null}
      {status === "ready" ? windowItems.map((item) => item.kind === "group" ? (
        <div key={item.id} className="flex h-8 min-w-0 items-center">
          <button type="button" aria-expanded={!item.collapsed}
            aria-label={`${item.collapsed ? "Expand" : "Collapse"} ${item.label}`}
            className="flex h-8 min-w-0 flex-1 items-center justify-between rounded-md px-2 text-left text-xs font-semibold text-muted-foreground hover:bg-accent"
            onClick={() => toggle("collapsedGroups", item.id)}>
            <span className="truncate">{item.collapsed ? "▸" : "▾"} {item.label}</span><span>{item.count}</span>
          </button>
          <ActionMenu label={`More for ${item.label}`} items={groupMenuItems(item, actions, sdk)} />
        </div>
      ) : (
        <ThreadRow key={item.id} item={item} activeThreadId={_props.activeThreadId}
          onToggle={(id) => toggle("collapsedThreads", id)} onNavigate={_props.onNavigate}
          actions={actions} sdk={sdk} sections={sections} pinned={pinned} />
      )) : null}
      {status === "ready" ? <div aria-hidden="true" style={{ height: (items.length - end) * ROW_HEIGHT }} /> : null}
      {showArchive && archived && (archiveError || (status === "ready" && archived.hasNextPage)) ? (
        <button type="button" disabled={archived.isFetchingNextPage}
          className="mt-2 w-full rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-50"
          onClick={() => { void archived.fetchNextPage().catch(() => {}); }}>
          {archived.isFetchNextPageError || archiveError ? "Retry archive" : archived.isFetchingNextPage ? "Loading more…" : "Show more"}
        </button>
      ) : null}
      </div>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "pr-status", title: "Threads with PRs",
    description: "Threads and the status of their branch pull requests.", component: ThreadList,
  });
});
