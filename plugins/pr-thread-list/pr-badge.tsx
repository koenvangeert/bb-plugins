import type { PluginSidebarThreadPullRequestState } from "@get-bb/plugin-sdk/app";
import { describePullRequest } from "./pr-status";

/** Pure presentation: BB's per-row hook feeds this when facts change. */
export function PrBadgeView({ isLoading, pullRequest }: PluginSidebarThreadPullRequestState) {
  if (isLoading || !pullRequest) return <span data-testid="pr-hook-consumer" hidden />;
  const { label, short, tone } = describePullRequest(pullRequest);
  const color = tone === "problem" ? "border-destructive text-destructive"
    : tone === "ready" ? "border-primary text-primary"
    : tone === "waiting" ? "border-border text-muted-foreground"
    : "border-border text-foreground";
  const content = <>#{pullRequest.number} · {short}</>;
  const badge = `inline-flex max-w-32 shrink-0 items-center truncate rounded border px-1 text-[10px] leading-4 ${color}`;
  const safeUrl = /^https?:\/\//i.test(pullRequest.url) ? pullRequest.url : null;
  return <span data-testid="pr-hook-consumer" className="shrink-0 pl-1">
    {safeUrl ? <a href={safeUrl} target="_blank" rel="noopener noreferrer" aria-label={label}
      title={`${label} — ${pullRequest.title}`} className={badge} onClick={(event) => event.stopPropagation()}>
      {content}
    </a> : <span title={label} className={badge}>{content}</span>}
  </span>;
}
