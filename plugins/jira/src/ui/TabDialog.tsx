import { useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { rpcContract, TicketList, TicketTab } from "../rpc";
import { errorMessage } from "../errorMessage";

function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="m-0 text-xs text-destructive">
      {error}
    </p>
  );
}

export function TabDialog({
  tab,
  onSaved,
  onOpenChange,
}: {
  tab?: Pick<TicketTab, "id" | "name" | "jql">;
  onSaved(list: TicketList): void;
  onOpenChange(open: boolean): void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const [name, setName] = useState(tab?.name ?? "");
  const [jql, setJql] = useState(tab?.jql ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canSave = Boolean(name.trim() && jql.trim()) && !saving;
  const close = (open: boolean) => {
    if (!saving) onOpenChange(open);
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      onSaved(await rpc.call("saveTab", { ...(tab ? { id: tab.id } : {}), name, jql }));
      onOpenChange(false);
    } catch (cause) {
      setError(errorMessage(cause));
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tab ? `Edit tab ${tab.name}` : "Add tab"}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            Name
            <Input value={name} placeholder="Ready to pick up" onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            JQL query
            <textarea
              className="min-h-24 rounded-md border border-input bg-transparent p-2 font-mono text-xs"
              value={jql}
              placeholder='status = "Ready for Dev" AND sprint in openSprints()'
              onChange={(event) => setJql(event.target.value)}
            />
          </label>
          <ErrorText error={error} />
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave}>
              {saving ? "Checking query…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteTabDialog({
  tab,
  onDeleted,
  onOpenChange,
}: {
  tab: Pick<TicketTab, "id" | "name">;
  onDeleted(list: TicketList): void;
  onOpenChange(open: boolean): void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const close = (open: boolean) => {
    if (!deleting) onOpenChange(open);
  };

  const remove = async () => {
    setDeleting(true);
    setError(null);
    try {
      onDeleted(await rpc.call("deleteTab", { id: tab.id }));
      onOpenChange(false);
    } catch (cause) {
      setError(errorMessage(cause));
      setDeleting(false);
    }
  };

  return (
    <Dialog open onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete tab {tab.name}?</DialogTitle>
        </DialogHeader>
        <p className="m-0 text-sm text-muted-foreground">Threads linked to its tickets stay linked.</p>
        <ErrorText error={error} />
        <DialogFooter>
          <Button variant="outline" disabled={deleting} onClick={() => close(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={deleting} onClick={() => void remove()}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
