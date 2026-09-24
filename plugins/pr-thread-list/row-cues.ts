import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

/** Keep BB's accessible status wording; survive new kinds without guessing. */
export function describeIndicator(thread: PluginSidebarThread): string | null {
  if (thread.indicatorLabel) return thread.indicatorLabel;
  switch (thread.indicator) {
    case "none": return null;
    case "queued-waiting": return "Queued message waiting";
    case "queued-failed": return "Queued message failed";
    case "waiting-for-input": return "Thread needs user input";
    case "unread-error": return "Unread thread error";
    case "unread-success": return "Unread thread success";
    case "runtime": return `Thread ${thread.runtimeStatus}`;
    case "background-agent": return "Background agent running";
    case "background-command": return "Background command running";
    case "workflow": return "Workflow running";
    case "goal": return "Goal running";
    case "plan-mode": return "Plan mode";
    case "working-draft": return "Working with an unsent draft";
    case "draft": return "Unsent draft";
    default: return `Thread status: ${thread.runtimeStatus || thread.status || "idle"}`;
  }
}

export function describeActivity(thread: PluginSidebarThread): string | null {
  const counts: [number, string][] = [
    [thread.activity.workflows, "workflow"],
    [thread.activity.backgroundAgents, "background agent"],
    [thread.activity.backgroundCommands, "background command"],
    [thread.activity.planMode, "plan-mode task"],
    [thread.activity.goals, "goal"],
  ];
  const active = counts.filter(([count]) => count > 0);
  return active.length === 0 ? null : active.map(([count, name]) =>
    `${count} ${name}${count === 1 ? "" : "s"}`).join(", ");
}
