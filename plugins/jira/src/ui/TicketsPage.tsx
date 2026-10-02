import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { useBbNavigate, useRpc } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { INSTALL_HINT, LOGIN_HINT } from "../acliErrors";
import type { rpcContract, TicketList } from "../rpc";
import { TICKET_LIMIT } from "../tickets";
import { errorMessage } from "../errorMessage";
import { formatRefreshTime } from "./format";
import { StartThreadDialog } from "./StartThreadDialog";
import { usePolled } from "./usePolled";

type TicketRow = TicketList["tickets"][number];

const STATUS_GROUPS = [
  { category: "indeterminate", title: "In progress", dot: "bg-sky-500", pill: "bg-sky-500/12 text-sky-600 dark:text-sky-400" },
  { category: "new", title: "To do", dot: "bg-muted-foreground", pill: "bg-muted text-muted-foreground" },
  { category: "done", title: "Done", dot: "bg-emerald-500", pill: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
] as const;

const OTHER_GROUP = { category: "", title: "Other", dot: "bg-muted-foreground/50", pill: "bg-muted text-muted-foreground" };

function groupFor(category: string) {
  return STATUS_GROUPS.find((group) => group.category === category) ?? OTHER_GROUP;
}

function issueTypeIcon(issueType: string): { name: string; className: string } {
  const type = issueType.toLowerCase();
  if (type.includes("bug")) return { name: "Bug", className: "text-red-500" };
  if (type.includes("epic")) return { name: "Zap", className: "text-violet-500" };
  if (type.includes("story")) return { name: "FileText", className: "text-emerald-500" };
  if (type.includes("sub")) return { name: "CornerDownRight", className: "text-sky-500" };
  return { name: "CircleCheck", className: "text-sky-500" };
}

function Banner({ tone, children }: { tone: "warning" | "error"; children: ReactNode }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        tone === "error"
          ? "border-destructive/40 bg-destructive/5 text-destructive"
          : "border-amber-500/40 bg-amber-500/8 text-foreground",
      )}
    >
      <Icon
        name={tone === "error" ? "AlertCircle" : "AlertTriangle"}
        className={cn("mt-0.5 size-4", tone === "warning" && "text-amber-500")}
        aria-hidden
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function HealthBanner({ list }: { list: TicketList }) {
  if (list.health === "missing") return <Banner tone="warning">acli is not installed. {INSTALL_HINT}</Banner>;
  if (list.health === "loggedOut") return <Banner tone="warning">acli is not logged in to Jira. {LOGIN_HINT}</Banner>;
  if (!list.error) return null;
  return (
    <Banner tone="error">
      Refresh failed: {list.error}
      {list.refreshedAt !== null ? ` Showing the list from ${formatRefreshTime(list.refreshedAt)}.` : null}
    </Banner>
  );
}

function EmptyState({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted">
        <Icon name={icon} className={cn("size-5 text-muted-foreground", icon === "Spinner" && "animate-spin")} aria-hidden />
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        {children}
      </p>
    </div>
  );
}

function TicketItem({ ticket, onStart }: { ticket: TicketRow; onStart(): void }) {
  const navigate = useBbNavigate();
  const type = issueTypeIcon(ticket.issueType);
  return (
    <li className="group flex gap-3 px-4 py-3 transition-colors hover:bg-state-hover/60">
      <Icon name={type.name} className={cn("mt-0.5 size-4", type.className)} aria-label={ticket.issueType || undefined} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="shrink-0 cursor-pointer font-mono text-xs text-muted-foreground hover:text-primary hover:underline disabled:cursor-default disabled:no-underline"
            title="Open in Jira"
            onClick={() => navigate.openUrl(ticket.url)}
            disabled={!ticket.url}
          >
            {ticket.key}
          </button>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
              groupFor(ticket.statusCategory).pill,
            )}
          >
            {ticket.status}
          </span>
        </div>
        <span className="text-sm font-medium leading-snug text-foreground">{ticket.summary}</span>
        {ticket.threads.length > 0 ? (
          <ul aria-label={`Threads for ${ticket.key}`} className="m-0 flex list-none flex-wrap gap-1.5 p-0 pt-0.5">
            {ticket.threads.map((thread) => (
              <li key={thread.threadId}>
                <button
                  type="button"
                  className={cn(
                    "inline-flex max-w-72 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-2 py-0.5 text-xs hover:bg-state-hover",
                    thread.archived && "opacity-60",
                  )}
                  onClick={() => navigate.toThread(thread.threadId)}
                >
                  <Icon name="MessageSquare" className="size-3 text-muted-foreground" aria-hidden />
                  <span className="truncate">{thread.title}</span>
                  {thread.archived ? <span className="text-muted-foreground">(archived)</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="shrink-0 self-start opacity-70 group-hover:opacity-100 focus-visible:opacity-100"
        onClick={onStart}
      >
        <Icon name="MessageSquarePlus" aria-hidden />
        Start thread
      </Button>
    </li>
  );
}

function TicketGroups({ tickets, onStart }: { tickets: TicketRow[]; onStart(ticket: TicketRow): void }) {
  const groups = [...STATUS_GROUPS, OTHER_GROUP]
    .map((group) => ({ ...group, tickets: tickets.filter((ticket) => groupFor(ticket.statusCategory) === group) }))
    .filter((group) => group.tickets.length > 0);
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group.title} aria-label={group.title} className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span className={cn("size-2 rounded-full", group.dot)} aria-hidden />
            {group.title}
            <span className="font-normal tabular-nums">{group.tickets.length}</span>
          </h2>
          <ul className="m-0 list-none divide-y divide-border overflow-hidden rounded-xl border border-border bg-card p-0">
            {group.tickets.map((ticket) => (
              <TicketItem key={ticket.key} ticket={ticket} onStart={() => onStart(ticket)} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function TicketsPage() {
  const rpc = useRpc<typeof rpcContract>();
  const load = useCallback(() => rpc.call("tickets", null), [rpc]);
  const { value: list, error: loadError, set: setList } = usePolled(load);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [starting, setStarting] = useState<TicketRow | null>(null);
  const busy = refreshing || Boolean(list?.refreshing);

  const refresh = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      setList(await rpc.call("refresh", null));
    } catch (cause) {
      setRefreshError(errorMessage(cause));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <header className="flex items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-[#0c66e4]/10">
              <Icon name="jira/jira" fallback="ListTodo" className="size-5" aria-hidden />
            </div>
            <div className="flex flex-col">
              <h1 className="text-base font-semibold leading-tight">My tickets</h1>
              <span className="text-xs text-muted-foreground">
                {list?.refreshedAt ? `Refreshed ${formatRefreshTime(list.refreshedAt)}` : "Assigned to you in Jira"}
              </span>
            </div>
          </div>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void refresh()}>
            <Icon name="ArrowReloadHorizontal" className={cn(busy && "animate-spin")} aria-hidden />
            {busy ? "Refreshing…" : "Refresh"}
          </Button>
        </header>
        {refreshError || (loadError && !list) ? <Banner tone="error">{refreshError ?? loadError}</Banner> : null}
        {!list ? (
          <EmptyState icon="Spinner">Loading tickets…</EmptyState>
        ) : (
          <>
            <HealthBanner list={list} />
            {list.tickets.length === 0 && list.refreshedAt !== null ? (
              <EmptyState icon="CircleCheck">No tickets match the query.</EmptyState>
            ) : null}
            {list.tickets.length === 0 && list.refreshedAt === null && list.health === "ok" && !list.error ? (
              <EmptyState icon="Spinner">Reading tickets from Jira…</EmptyState>
            ) : null}
            {list.tickets.length > 0 ? <TicketGroups tickets={list.tickets} onStart={setStarting} /> : null}
            {list.limitReached ? (
              <p className="text-center text-xs text-muted-foreground">
                Showing the first {TICKET_LIMIT} tickets. Narrow the query in the plugin settings to see the rest.
              </p>
            ) : null}
          </>
        )}
        {starting ? (
          <StartThreadDialog
            ticketKey={starting.key}
            summary={starting.summary}
            onOpenChange={(open) => !open && setStarting(null)}
          />
        ) : null}
      </div>
    </div>
  );
}
