import { useState } from "react";
import type { Task, TaskDependencyRef } from "../../shared/contract.js";
import { errorMessage } from "../../shared/errors.js";
import { listAllTasks, useTasksQuery, useTasksRpc } from "../../shell/data.js";
import { useTasksNavigation } from "../../shell/routes.js";
import { STATUS_LABELS } from "../list/lib.js";
import { StatusIcon } from "./meta.js";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Icon } from "@/components/ui/icon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Side = "blockedBy" | "blocks";

const SIDE_TITLES: Record<Side, string> = {
  blockedBy: "Blocked by",
  blocks: "Blocks",
};

const ADD_LABELS: Record<Side, string> = {
  blockedBy: "Add blocker",
  blocks: "Add blocked task",
};

function TaskPicker({
  side,
  candidates,
  onPick,
}: {
  side: Side;
  candidates: readonly Task[];
  onPick: (task: Task) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <Icon name="Plus" className="size-3" />
          {ADD_LABELS[side]}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Find a task…" />
          <CommandList>
            <CommandEmpty>No tasks.</CommandEmpty>
            <CommandGroup>
              {candidates.map((candidate) => (
                <CommandItem
                  key={candidate.id}
                  value={`${candidate.key} ${candidate.title}`}
                  onSelect={() => {
                    setOpen(false);
                    onPick(candidate);
                  }}
                >
                  <StatusIcon status={candidate.status} className="size-3" />
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {candidate.key}
                  </span>
                  <span className="min-w-0 truncate">{candidate.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function DependencyList({
  side,
  refs,
  candidates,
  onAdd,
  onRemove,
}: {
  side: Side;
  refs: readonly TaskDependencyRef[];
  candidates: readonly Task[];
  onAdd: (task: Task) => void;
  onRemove: (ref: TaskDependencyRef) => void;
}) {
  const navigation = useTasksNavigation();
  return (
    <section aria-label={SIDE_TITLES[side]} className="mt-5">
      <h2 className="mb-1 text-xs font-semibold text-muted-foreground">
        {SIDE_TITLES[side]}
      </h2>
      {refs.map((ref) => (
        <div
          key={ref.id}
          className="flex h-8 items-center gap-2 border-b border-border-hairline px-0.5 text-sm hover:bg-state-hover"
        >
          <button
            type="button"
            title={STATUS_LABELS[ref.status]}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            onClick={() => navigation.go({ kind: "task", taskKey: ref.key })}
          >
            <StatusIcon status={ref.status} />
            <span className="shrink-0 text-xs text-muted-foreground">
              {ref.key}
            </span>
            <span className="min-w-0 truncate">{ref.title}</span>
          </button>
          <button
            type="button"
            aria-label={`Remove ${ref.key} from ${SIDE_TITLES[side]}`}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            onClick={() => onRemove(ref)}
          >
            <Icon name="X" className="size-3.5" />
          </button>
        </div>
      ))}
      <TaskPicker side={side} candidates={candidates} onPick={onAdd} />
    </section>
  );
}

export function DependencySections({
  task,
  onChanged,
  onError,
}: {
  task: Task;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const rpc = useTasksRpc();
  const allTasks = useTasksQuery(
    async (query) => listAllTasks(query, {}),
    ["tasks:changed"],
  );
  const blockedBy = task.blockedBy ?? [];
  const blocks = task.blocks ?? [];
  const linked = new Set([
    task.id,
    ...blockedBy.map((ref) => ref.id),
    ...blocks.map((ref) => ref.id),
  ]);
  const candidates = (allTasks.data ?? []).filter(
    (candidate) => !linked.has(candidate.id),
  );

  const link = async (blockerTaskId: string, blockedTaskId: string) => {
    try {
      const result = await rpc.call("addTaskDependency", {
        blockerTaskId,
        blockedTaskId,
      });
      if (!result.ok) {
        onError(result.error.message);
        return;
      }
      onChanged();
    } catch (error) {
      onError(errorMessage(error));
    }
  };

  const unlink = async (blockerTaskId: string, blockedTaskId: string) => {
    try {
      await rpc.call("removeTaskDependency", { blockerTaskId, blockedTaskId });
      onChanged();
    } catch (error) {
      onError(errorMessage(error));
    }
  };

  return (
    <>
      <DependencyList
        side="blockedBy"
        refs={blockedBy}
        candidates={candidates}
        onAdd={(picked) => void link(picked.id, task.id)}
        onRemove={(ref) => void unlink(ref.id, task.id)}
      />
      <DependencyList
        side="blocks"
        refs={blocks}
        candidates={candidates}
        onAdd={(picked) => void link(task.id, picked.id)}
        onRemove={(ref) => void unlink(task.id, ref.id)}
      />
    </>
  );
}
