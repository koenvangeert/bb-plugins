import type { PluginSidebarPullRequest } from "@get-bb/plugin-sdk/app";

export interface PrBadgeText {
  short: string;
  label: string;
  tone: "neutral" | "waiting" | "problem" | "ready";
}

/** BB owns the attention rollup; do not recompute review/check priority here. */
export function describePullRequest(pr: PluginSidebarPullRequest): PrBadgeText {
  const text = (short: string, status: string, tone: PrBadgeText["tone"]): PrBadgeText =>
    ({ short, label: `PR #${pr.number}: ${status}`, tone });
  if (pr.state === "merged") return text("Merged", "merged", "neutral");
  if (pr.state === "closed") return text("Closed", "closed", "neutral");
  if (pr.state === "draft") return text("Draft", "draft", "neutral");
  if (pr.state !== "open") return text("Unknown", "status unknown", "neutral");
  switch (pr.attention) {
    case "checks_pending": return text("Pending", "checks pending", "waiting");
    case "checks_failed": return text("Failed", "checks failed", "problem");
    case "review_requested": return text("Review", "review requested", "waiting");
    case "changes_requested": return text("Changes", "changes requested", "problem");
    case "conflicts": return text("Conflicts", "merge conflicts", "problem");
    case "blocked": return text("Blocked", "merge blocked", "problem");
    case "ready_to_merge": return text("Ready", "ready to merge", "ready");
    case "none": return text("Open", "open", "neutral");
    default: return text("Open", "open", "neutral");
  }
}
