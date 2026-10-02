import { useEffect, useState } from "react";
import { useBbNavigate, useRpc } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { rpcContract } from "../rpc";
import { errorMessage } from "../errorMessage";

export function StartThreadDialog({
  ticketKey,
  summary,
  onOpenChange,
}: {
  ticketKey: string;
  summary: string;
  onOpenChange(open: boolean): void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [projects, setProjects] = useState<{ id: string; name: string }[] | null>(null);
  const [projectId, setProjectId] = useState("");
  const [prompt, setPrompt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let current = true;
    rpc.call("projects", null).then((list) => current && setProjects(list), (cause) => current && setError(errorMessage(cause)));
    rpc
      .call("ticket", { key: ticketKey })
      .then((detail) => current && setPrompt((draft) => draft ?? detail.prompt))
      .catch((cause) => {
        if (!current) return;
        setPrompt((draft) => draft ?? `Work on Jira ticket ${ticketKey}: ${summary}`);
        setError(`Could not read the ticket description: ${errorMessage(cause)}`);
      });
    return () => {
      current = false;
    };
  }, [rpc, ticketKey, summary]);

  const start = async () => {
    if (!projectId || !prompt?.trim()) return;
    setStarting(true);
    setError(null);
    try {
      const { threadId } = await rpc.call("startThread", { projectId, key: ticketKey, prompt });
      onOpenChange(false);
      navigate.toThread(threadId);
    } catch (cause) {
      setError(errorMessage(cause));
      setStarting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Start thread for {ticketKey}: {summary}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Project
            <select
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              value={projectId}
              disabled={!projects}
              onChange={(event) => setProjectId(event.target.value)}
            >
              <option value="">{projects ? "Pick a project" : "Loading projects…"}</option>
              {projects?.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            First prompt
            <textarea
              className="min-h-48 rounded-md border border-input bg-transparent p-2 font-mono text-xs"
              value={prompt ?? ""}
              placeholder="Loading the ticket…"
              disabled={prompt === null}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </label>
          {error ? (
            <p role="alert" className="m-0 text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!projectId || !prompt?.trim() || starting} onClick={() => void start()}>
            {starting ? "Starting…" : "Start thread"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
