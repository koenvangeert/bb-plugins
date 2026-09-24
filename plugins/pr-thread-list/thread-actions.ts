import type {
  PluginBrowserBbSdk, PluginSidebarSection, PluginSidebarThread, PluginSidebarThreadActions,
} from "@get-bb/plugin-sdk/app";
import type { MenuItem } from "./action-menu";
import type { ListItem } from "./list-model";

const askName = (label: string, current = "") => window.prompt(label, current)?.trim() || null;

export function threadMenuItems(thread: PluginSidebarThread, actions: PluginSidebarThreadActions,
  sdk: PluginBrowserBbSdk, sections: readonly PluginSidebarSection[], pinned: readonly PluginSidebarThread[],
  splitAvailable: boolean, onNavigate: () => void): MenuItem[] {
  const id = thread.id;
  const index = pinned.findIndex((row) => row.id === id);
  const items: MenuItem[] = [
    { label: thread.isPinned ? "Unpin" : "Pin", run: () => actions.setPinned(id, !thread.isPinned) },
    { label: thread.isUnread ? "Mark read" : "Mark unread", run: () => actions.setRead(id, thread.isUnread) },
    { label: "Rename", run: () => { const title = askName("Rename thread", thread.displayTitle); if (title) return actions.rename(id, title); } },
  ];
  if (splitAvailable) items.push({ label: "Open in split", run: () => { actions.open(id, { split: true }); onNavigate(); } });
  if (index > 0) items.push({ label: "Move up", run: () => sdk.threads.reorderPinned({
    threadId: id, previousThreadId: pinned[index - 2]?.id ?? null, nextThreadId: pinned[index - 1]!.id,
  }) });
  if (index >= 0 && index < pinned.length - 1) items.push({ label: "Move down", run: () => sdk.threads.reorderPinned({
    threadId: id, previousThreadId: pinned[index + 1]!.id, nextThreadId: pinned[index + 2]?.id ?? null,
  }) });
  if (thread.sectionId !== null) items.push({ label: "Move to Threads", run: () => sdk.threads.update({ threadId: id, sectionId: null }) });
  for (const section of sections) if (section.id !== thread.sectionId) {
    items.push({ label: `Move to ${section.name}`, run: () => sdk.threads.update({ threadId: id, sectionId: section.id }) });
  }
  if (thread.environment?.id) items.push({ label: "New thread in environment", run: () => actions.openNewThread({ projectId: thread.projectId, environmentId: thread.environment!.id! }) });
  items.push(thread.isArchived
    ? { label: "Unarchive", run: () => sdk.threads.unarchive({ threadId: id }) }
    : { label: "Archive", run: () => actions.archive(id) });
  items.push({ label: "Delete…", run: () => actions.requestDelete(id) });
  return items;
}

export function groupMenuItems(group: Extract<ListItem, { kind: "group" }>,
  actions: PluginSidebarThreadActions, sdk: PluginBrowserBbSdk): MenuItem[] {
  const id = group.id;
  const newThread = id.startsWith("project:") ? { projectId: id.slice(8) }
    : id.startsWith("section:") ? { sectionId: id.slice(8) } : {};
  const items: MenuItem[] = [{ label: "New thread", run: () => actions.openNewThread({ ...newThread, focusPrompt: true }) }];
  if (id.startsWith("section:")) items.push({ label: "Rename section", run: () => {
    const name = askName("Rename section", group.label);
    if (name) return sdk.threadSections.update({ id: id.slice(8), name });
  } });
  return items;
}

export function createSection(sdk: PluginBrowserBbSdk): Promise<unknown> | undefined {
  const name = askName("New section name");
  if (name) return sdk.threadSections.create({ name });
}
