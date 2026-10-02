import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { useBbNavigate, useRpc } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { INSTALL_HINT, LOGIN_HINT } from "../acliErrors";
import type { rpcContract, TicketList } from "../rpc";
import { TICKET_LIMIT } from "../tickets";
import { errorMessage } from "../errorMessage";
import { formatRefreshTime } from "./format";
import { StartThreadDialog } from "./StartThreadDialog";
import { usePolled } from "./usePolled";

type TicketRow = TicketList["tickets"][number];

function Banner({ tone, children }: { tone: "warning" | "error"; children: ReactNode }) {
  return (
    <div
      role="alert"
      className={`rounded-lg border px-4 py-3 text-sm ${
        tone === "error" ? "border-destructive/50 text-destructive" : "border-border bg-muted/40"
      }`}
    >
      {children}
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

function TicketItem({ ticket, onStart }: { ticket: TicketRow; onStart(): void }) {
  const navigate = useBbNavigate();
  return (
    <li className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="shrink-0 cursor-pointer font-mono text-xs text-primary hover:underline disabled:cursor-default disabled:no-underline"
          title="Open in Jira"
          onClick={() => navigate.openUrl(ticket.url)}
          disabled={!ticket.url}
        >
          {ticket.key}
        </button>
        <span className="min-w-0 flex-1 truncate text-sm">{ticket.summary}</span>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
          {ticket.status}
        </span>
        <Button size="sm" variant="outline" onClick={onStart}>
          Start thread
        </Button>
      </div>
      {ticket.threads.length > 0 ? (
        <ul aria-label={`Threads for ${ticket.key}`} className="m-0 flex list-none flex-wrap gap-2 p-0 pl-16">
          {ticket.threads.map((thread) => (
            <li key={thread.threadId}>
              <button
                type="button"
                className="cursor-pointer rounded-md bg-muted px-2 py-0.5 text-xs hover:bg-state-hover"
                onClick={() => navigate.toThread(thread.threadId)}
              >
                {thread.title}
                {thread.archived ? <span className="text-muted-foreground"> (archived)</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function TicketsPage() {
  const rpc = useRpc<typeof rpcContract>();
  const load = useCallback(() => rpc.call("tickets", null), [rpc]);
  const { value: list, error: loadError, set: setList } = usePolled(load);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [starting, setStarting] = useState<TicketRow | null>(null);

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
    <div className="h-full min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <header className="flex items-center justify-end gap-4">
          <div className="flex items-center gap-3">
            {list?.refreshedAt ? (
              <span className="text-xs text-muted-foreground">Refreshed {formatRefreshTime(list.refreshedAt)}</span>
            ) : null}
            <Button size="sm" variant="outline" disabled={refreshing || list?.refreshing} onClick={() => void refresh()}>
              {refreshing || list?.refreshing ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </header>
        {refreshError || (loadError && !list) ? <Banner tone="error">{refreshError ?? loadError}</Banner> : null}
        {!list ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading tickets…
          </p>
        ) : (
          <>
            <HealthBanner list={list} />
            {list.tickets.length === 0 && list.refreshedAt !== null ? (
              <p role="status" className="text-sm text-muted-foreground">
                No tickets match the query.
              </p>
            ) : null}
            {list.tickets.length === 0 && list.refreshedAt === null && list.health === "ok" && !list.error ? (
              <p role="status" className="text-sm text-muted-foreground">
                Reading tickets from Jira…
              </p>
            ) : null}
            {list.tickets.length > 0 ? (
              <ul className="m-0 list-none p-0">
                {list.tickets.map((ticket) => (
                  <TicketItem key={ticket.key} ticket={ticket} onStart={() => setStarting(ticket)} />
                ))}
              </ul>
            ) : null}
            {list.limitReached ? (
              <p className="text-xs text-muted-foreground">
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

