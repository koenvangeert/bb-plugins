import { useCallback, useState } from "react";
import { useBbNavigate, useRpc, type PluginThreadHeaderActionProps } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { rpcContract, ThreadLinkResult, TicketList } from "../rpc";
import { errorMessage } from "../errorMessage";
import { usePolled } from "./usePolled";

export function ThreadTicket({ threadId, isCompactViewport }: PluginThreadHeaderActionProps) {
  const rpc = useRpc<typeof rpcContract>();
  const load = useCallback(() => rpc.call("threadLink", { threadId }), [rpc, threadId]);
  const { value: link, refresh } = usePolled(load);
  const [open, setOpen] = useState(false);
  if (!link) return null;

  const label = link.issueKey
    ? isCompactViewport
      ? link.issueKey
      : `${link.issueKey} · ${link.ticket?.status ?? "Status unknown"}`
    : "Link Jira";

  return (
    <>
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open ? (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent>
            {link.issueKey ? (
              <LinkedTicket
                issueKey={link.issueKey}
                ticket={link.ticket}
                error={link.error}
                onClose={() => setOpen(false)}
                onUnlink={async () => {
                  await rpc.call("unlink", { threadId });
                  await refresh();
                  setOpen(false);
                }}
              />
            ) : (
              <LinkPicker
                threadId={threadId}
                onLinked={async () => {
                  await refresh();
                  setOpen(false);
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

function LinkedTicket({
  issueKey,
  ticket,
  error: readError,
  onClose,
  onUnlink,
}: {
  issueKey: string;
  ticket: ThreadLinkResult["ticket"];
  error: string | null;
  onClose(): void;
  onUnlink(): Promise<void>;
}) {
  const navigate = useBbNavigate();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {issueKey}
          {ticket ? `: ${ticket.summary}` : null}
        </DialogTitle>
      </DialogHeader>
      <p className="m-0 text-sm">Status: {ticket?.status ?? "unknown"}</p>
      {readError ? <p className="m-0 text-xs text-destructive">Could not read the ticket: {readError}</p> : null}
      {error ? (
        <p role="alert" className="m-0 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        {ticket?.url ? (
          <Button
            size="sm"
            onClick={() => {
              navigate.openUrl(ticket.url);
              onClose();
            }}
          >
            Open in Jira
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          onClick={() => onUnlink().catch((cause) => setError(errorMessage(cause)))}
        >
          Unlink
        </Button>
      </div>
    </>
  );
}

function LinkPicker({ threadId, onLinked }: { threadId: string; onLinked(): Promise<void> }) {
  const rpc = useRpc<typeof rpcContract>();
  const loadTickets = useCallback(() => rpc.call("tickets", null), [rpc]);
  const { value: list } = usePolled<TicketList>(loadTickets);
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const link = async (issueKey: string) => {
    setLinking(true);
    setError(null);
    try {
      await rpc.call("link", { threadId, key: issueKey });
      await onLinked();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLinking(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Link a Jira ticket</DialogTitle>
      </DialogHeader>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (key.trim()) void link(key);
        }}
      >
        <Input aria-label="Ticket key" placeholder="ABC-123" value={key} onChange={(event) => setKey(event.target.value)} />
        <Button type="submit" disabled={!key.trim() || linking}>
          Link
        </Button>
      </form>
      {error ? (
        <p role="alert" className="m-0 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {list && list.tickets.length > 0 ? (
        <ul aria-label="My tickets" className="m-0 flex max-h-72 list-none flex-col overflow-y-auto p-0">
          {list.tickets.map((ticket) => (
            <li key={ticket.key}>
              <button
                type="button"
                disabled={linking}
                className="flex w-full cursor-pointer gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-state-hover disabled:cursor-default"
                onClick={() => void link(ticket.key)}
              >
                <span className="font-mono text-xs">{ticket.key}</span>
                <span className="min-w-0 flex-1 truncate">{ticket.summary}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
