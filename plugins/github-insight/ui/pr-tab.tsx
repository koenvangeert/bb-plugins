import { useEffect, useState, type ReactNode } from "react";
import { UrlLink, useRpc } from "@get-bb/plugin-sdk/app";
import type { InsightResult, rpcContract } from "../contract";
import type { Check, CheckStatus } from "../core/checks";
import type { PrInsight } from "../core/overview";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

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

function useInsight(threadId: string): InsightResult | null {
  const rpc = useRpc<typeof rpcContract>();
  const [result, setResult] = useState<InsightResult | null>(null);
  useEffect(() => {
    let current = true;
    setResult(null);
    rpc.call("getInsight", { threadId }).then(
      (next) => {
        if (current) setResult(next);
      },
      (error: unknown) => {
        if (current) {
          setResult({
            kind: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [rpc, threadId]);
  return result;
}

export function PrTab({ threadId }: { threadId: string }) {
  const result = useInsight(threadId);
  if (result === null) return <Notice>Loading pull request…</Notice>;
  if (result.kind === "no_pr") {
    return <Notice>No pull request for this thread</Notice>;
  }
  if (result.kind === "error") {
    return (
      <p role="alert" className="text-sm text-destructive">
        {result.message}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <PrHeader pr={result.insight.pr} />
      <CheckList checks={result.insight.checks} />
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

function PrHeader({ pr }: { pr: PrInsight["pr"] }) {
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
      </div>
      <h2 className="text-sm font-medium">{pr.title}</h2>
    </header>
  );
}

function CheckList({ checks }: { checks: readonly Check[] }) {
  if (checks.length === 0) return <Notice>No checks on the head commit</Notice>;
  return (
    <section className="flex flex-col gap-3">
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

const GROUP_HEADING_CLASS = "text-xs font-medium text-muted-foreground";

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
      <h3 className={GROUP_HEADING_CLASS}>
        <GroupHeading {...props} />
      </h3>
      <CheckRows checks={props.checks} />
    </div>
  );
}

function CollapsedCheckGroup(props: CheckGroupProps) {
  return (
    <details>
      <summary className={cn(GROUP_HEADING_CLASS, "cursor-pointer select-none")}>
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
    <li className="flex min-w-0 items-center gap-2 py-1 text-sm">
      <Icon name={icon.name} className={cn("size-4 shrink-0", icon.className)} />
      {check.url === null ? (
        <span className="truncate">{check.name}</span>
      ) : (
        <UrlLink href={check.url} className="truncate underline-offset-2 hover:underline">
          {check.name}
        </UrlLink>
      )}
    </li>
  );
}
