import type { ReactNode } from "react";
import { UrlLink } from "@get-bb/plugin-sdk/app";
import type { Blocker } from "../core/blockers";
import type { Check, CheckStatus } from "../core/checks";
import type { CheckFailure } from "../core/failure";
import type { PrInsight } from "../core/overview";
import { reviewerKey, type Reviewer } from "../core/reviewers";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { useInsight } from "./use-insight";

const STATUS_ORDER: readonly CheckStatus[] = [
  "failed",
  "cancelled",
  "running",
  "passed",
  "skipped",
];

const COLLAPSED_STATUSES: ReadonlySet<CheckStatus> = new Set([
  "passed",
  "skipped",
]);

const STATUS_ICON: Record<CheckStatus, { name: IconName; className: string }> = {
  failed: { name: "CircleX", className: "text-destructive" },
  cancelled: { name: "Unavailable", className: "text-muted-foreground" },
  running: { name: "Spinner", className: "text-amber-500" },
  passed: { name: "CircleCheck", className: "text-emerald-500" },
  skipped: { name: "Circle", className: "text-muted-foreground" },
};

const PR_STATE_LABEL: Record<PrInsight["pr"]["state"], string> = {
  open: "Open",
  draft: "Draft",
  closed: "Closed",
  merged: "Merged",
};

const REVIEWER_STATE_LABEL: Record<Reviewer["state"], string> = {
  pending: "Pending",
  approved: "Approved",
  changes_requested: "Changes requested",
  commented: "Commented",
  dismissed: "Dismissed",
};

export function PrTab({ threadId }: { threadId: string }) {
  const { result, refreshing, refresh } = useInsight(threadId);
  if (result === null) return <Notice>Loading pull request…</Notice>;
  if (result.kind === "no_pr") {
    return <Notice>No pull request for this thread</Notice>;
  }
  if (result.kind === "error") {
    return (
      <RefreshError message={result.message} refreshedAt={null} retry={refresh} busy={refreshing} />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <PrHeader
        pr={result.insight.pr}
        action={<RefreshButton refreshing={refreshing} refresh={refresh} />}
      />
      {result.error !== null && (
        <RefreshError
          message={result.error}
          refreshedAt={result.refreshedAt}
          retry={refresh}
          busy={refreshing}
        />
      )}
      <BlockerList blockers={result.insight.blockers} />
      <ReviewerList reviewers={result.insight.reviewers} />
      <CheckList checks={result.insight.checks} />
    </div>
  );
}

const BUTTON_CLASS =
  "inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted disabled:opacity-60";

function RefreshButton({ refreshing, refresh }: { refreshing: boolean; refresh: () => void }) {
  return (
    <button type="button" className={BUTTON_CLASS} onClick={refresh} disabled={refreshing}>
      <Icon
        name="ArrowReloadHorizontal"
        className={cn("size-3.5", refreshing && "animate-spin")}
      />
      {refreshing ? "Refreshing…" : "Refresh"}
    </button>
  );
}

interface RefreshErrorProps {
  message: string;
  refreshedAt: number | null;
  retry: () => void;
  busy: boolean;
}

function RefreshError({ message, refreshedAt, retry, busy }: RefreshErrorProps) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 rounded-lg border border-destructive/40 px-3 py-2 text-sm"
    >
      <Icon name="AlertCircle" className="size-4 shrink-0 text-destructive" />
      <div className="flex min-w-0 flex-col">
        <span className="break-words text-destructive">{message}</span>
        {refreshedAt !== null && (
          <span className="text-xs text-muted-foreground">
            Last updated{" "}
            <time dateTime={new Date(refreshedAt).toISOString()}>
              {new Date(refreshedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </span>
        )}
      </div>
      <button type="button" className={cn(BUTTON_CLASS, "ml-auto")} onClick={retry} disabled={busy}>
        Retry
      </button>
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
    >
      {children}
    </div>
  );
}

function PrHeader({ pr, action }: { pr: PrInsight["pr"]; action: ReactNode }) {
  return (
    <header className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-mono">#{pr.number}</span>
        <span className="rounded-full border border-border px-2 py-0.5">
          {PR_STATE_LABEL[pr.state]}
        </span>
        <UrlLink href={pr.url} className="ml-auto underline-offset-2 hover:underline">
          Open on GitHub
        </UrlLink>
        {action}
      </div>
      <h2 className="text-sm font-medium">{pr.title}</h2>
    </header>
  );
}

const SECTION_HEADING_CLASS = "text-xs font-medium text-muted-foreground";

const LABEL_CLASS =
  "shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground";

function BlockerList({ blockers }: { blockers: readonly Blocker[] }) {
  if (blockers.length === 0) return null;
  return (
    <section aria-label="Merge blockers" className="flex flex-col gap-1">
      <h3 className={SECTION_HEADING_CLASS}>Merge blockers</h3>
      <ul className="flex flex-col">
        {blockers.map((blocker) => (
          <li key={blocker.code} className="flex items-center gap-2 py-0.5 text-sm">
            <Icon name="AlertCircle" className="size-4 shrink-0 text-amber-500" />
            {blocker.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReviewerList({ reviewers }: { reviewers: readonly Reviewer[] }) {
  if (reviewers.length === 0) return null;
  return (
    <section aria-label="Reviewers" className="flex flex-col gap-1">
      <h3 className={SECTION_HEADING_CLASS}>Reviewers</h3>
      <ul className="flex flex-col">
        {reviewers.map((reviewer) => (
          <li
            key={reviewerKey(reviewer)}
            className="flex min-w-0 items-center gap-2 py-0.5 text-sm"
          >
            <span className="truncate">
              {reviewer.kind === "team" ? `${reviewer.name} (team)` : reviewer.name}
            </span>
            <span className={cn(LABEL_CLASS, "ml-auto")}>
              {REVIEWER_STATE_LABEL[reviewer.state]}
            </span>
            {reviewer.codeOwner && <span className={LABEL_CLASS}>code owner</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function CheckList({ checks }: { checks: readonly Check[] }) {
  if (checks.length === 0) return <Notice>No checks on the head commit</Notice>;
  return (
    <section aria-label="Checks" className="flex flex-col gap-3">
      {STATUS_ORDER.map((status) => {
        const group = checks.filter((check) => check.status === status);
        if (group.length === 0) return null;
        const Group = COLLAPSED_STATUSES.has(status)
          ? CollapsedCheckGroup
          : OpenCheckGroup;
        return <Group key={status} status={status} checks={group} />;
      })}
    </section>
  );
}

interface CheckGroupProps {
  status: CheckStatus;
  checks: readonly Check[];
}

function GroupHeading({ status, checks }: CheckGroupProps) {
  return (
    <span data-testid="check-group-heading">
      {checks.length} {status}
    </span>
  );
}

function OpenCheckGroup(props: CheckGroupProps) {
  return (
    <div>
      <h3 className={SECTION_HEADING_CLASS}>
        <GroupHeading {...props} />
      </h3>
      <CheckRows checks={props.checks} />
    </div>
  );
}

function CollapsedCheckGroup(props: CheckGroupProps) {
  return (
    <details>
      <summary className={cn(SECTION_HEADING_CLASS, "cursor-pointer select-none")}>
        <GroupHeading {...props} />
      </summary>
      <CheckRows checks={props.checks} />
    </details>
  );
}

function CheckRows({ checks }: { checks: readonly Check[] }) {
  return (
    <ul className="mt-1 flex flex-col">
      {checks.map((check) => (
        <CheckRow key={check.name} check={check} />
      ))}
    </ul>
  );
}

function CheckRow({ check }: { check: Check }) {
  const icon = STATUS_ICON[check.status];
  return (
    <li className="flex min-w-0 flex-col gap-1 py-1 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <Icon name={icon.name} className={cn("size-4 shrink-0", icon.className)} />
        {check.url === null ? (
          <span className="truncate">{check.name}</span>
        ) : (
          <UrlLink href={check.url} className="truncate underline-offset-2 hover:underline">
            {check.name}
          </UrlLink>
        )}
      </div>
      {check.failure !== null && <CheckFailureDetail failure={check.failure} />}
    </li>
  );
}

function CheckFailureDetail({ failure }: { failure: CheckFailure }) {
  const hiddenCount = failure.annotationCount - failure.annotations.length;
  return (
    <div className="flex min-w-0 flex-col gap-1 pl-6 text-xs text-muted-foreground">
      {failure.reason !== "" && (
        <p data-testid="check-reason" className="line-clamp-3 break-words">
          {failure.reason}
        </p>
      )}
      {failure.annotations.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {failure.annotations.map((annotation, index) => (
            <li key={index} data-testid="check-annotation" className="min-w-0 break-words">
              <span className="font-mono">
                {annotation.path}:{annotation.line}
              </span>{" "}
              {annotation.message}
            </li>
          ))}
        </ul>
      )}
      {hiddenCount > 0 && <p>{hiddenCount} more</p>}
    </div>
  );
}
