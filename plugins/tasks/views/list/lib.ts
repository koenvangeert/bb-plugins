import {
  TASK_STATUSES,
  type Label,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "../../shared/contract.js";
import type { TaskSort } from "../../shared/pagination.js";
import { sortTasks } from "../../shared/sort.js";

export const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
  canceled: "Canceled",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No priority",
};

export const SORT_LABELS: Record<TaskSort, string> = {
  manual: "Manual",
  priority: "Priority",
  due: "Due date",
};

interface StatusGroup {
  status: TaskStatus;
  tasks: Task[];
}

export function groupTasksByStatus(tasks: readonly Task[]): StatusGroup[] {
  const byStatus = new Map<TaskStatus, Task[]>();
  for (const task of tasks) {
    const bucket = byStatus.get(task.status);
    if (bucket) bucket.push(task);
    else byStatus.set(task.status, [task]);
  }
  return TASK_STATUSES.flatMap((status) => {
    const bucket = byStatus.get(status);
    return bucket ? [{ status, tasks: bucket }] : [];
  });
}

export interface ListTreeEntry {
  task: Task;
  dimmed: boolean;
  children: Task[];
  subDone: number;
  subTotal: number;
  autoExpand: boolean;
}

export function buildListTree(
  matches: readonly Task[],
  scope: readonly Task[],
  filtered: boolean,
): ListTreeEntry[] {
  const scopeById = new Map(scope.map((task) => [task.id, task]));
  const progress = new Map<string, { done: number; total: number }>();
  for (const task of scope) {
    if (task.parentTaskId === null) continue;
    const entry = progress.get(task.parentTaskId) ?? { done: 0, total: 0 };
    entry.total += 1;
    if (task.status === "done") entry.done += 1;
    progress.set(task.parentTaskId, entry);
  }

  const matchedTopLevel = new Map<string, Task>();
  const childrenByParent = new Map<string, Task[]>();
  for (const task of matches) {
    const parentId = task.parentTaskId;
    if (parentId === null || !scopeById.has(parentId)) {
      matchedTopLevel.set(task.id, task);
      continue;
    }
    const bucket = childrenByParent.get(parentId);
    if (bucket) bucket.push(task);
    else childrenByParent.set(parentId, [task]);
  }

  const toEntry = (task: Task, dimmed: boolean): ListTreeEntry => {
    const children = childrenByParent.get(task.id) ?? [];
    return {
      task,
      dimmed,
      children,
      subDone: progress.get(task.id)?.done ?? 0,
      subTotal: progress.get(task.id)?.total ?? 0,
      autoExpand: filtered && children.length > 0,
    };
  };

  const entries: ListTreeEntry[] = [];
  const placed = new Set<string>();
  for (const task of scope) {
    const matched = matchedTopLevel.get(task.id);
    if (matched !== undefined) {
      entries.push(toEntry(matched, false));
      placed.add(task.id);
    } else if (childrenByParent.has(task.id)) {
      entries.push(toEntry(task, true));
      placed.add(task.id);
    }
  }
  for (const task of matchedTopLevel.values()) {
    if (!placed.has(task.id)) entries.push(toEntry(task, false));
  }
  return entries;
}

interface ListTreeGroup {
  status: TaskStatus;
  entries: ListTreeEntry[];
}

export function groupListTree(
  entries: readonly ListTreeEntry[],
  sort: TaskSort,
): ListTreeGroup[] {
  const byId = new Map(entries.map((entry) => [entry.task.id, entry]));
  return groupTasksByStatus(
    sortTasks(
      entries.map((entry) => entry.task),
      sort,
    ),
  ).map((group) => ({
    status: group.status,
    entries: group.tasks.flatMap((task) => {
      const entry = byId.get(task.id);
      return entry
        ? [{ ...entry, children: sortTasks(entry.children, sort) }]
        : [];
    }),
  }));
}

export interface LabelFilterOption {
  name: string;
  color: string;
  labelIds: string[];
}

export function labelFilterOptions(
  labels: readonly Label[],
): LabelFilterOption[] {
  const byName = new Map<string, LabelFilterOption>();
  for (const label of labels) {
    const existing = byName.get(label.name);
    if (existing) existing.labelIds.push(label.id);
    else
      byName.set(label.name, {
        name: label.name,
        color: label.color,
        labelIds: [label.id],
      });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function selectedLabelIds(
  options: readonly LabelFilterOption[],
  selectedNames: readonly string[],
): string[] {
  const selected = new Set(selectedNames);
  return options
    .filter((option) => selected.has(option.name))
    .flatMap((option) => option.labelIds);
}

export function formatDueDate(dueDate: string, today = new Date()): string {
  const date = new Date(`${dueDate}T00:00:00`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  });
}

export function activeWorkLabel(
  threads: readonly { liveStatus: string }[],
): string {
  if (threads.length === 1) {
    return threads[0]?.liveStatus === "starting"
      ? "Agent starting"
      : "Agent working";
  }
  return `${threads.length} agents working`;
}

interface LabelOverflow {
  visible: Label[];
  hidden: Label[];
}

export function partitionLabels(
  labels: readonly Label[],
  maxVisible: number,
): LabelOverflow {
  if (labels.length <= maxVisible) {
    return { visible: [...labels], hidden: [] };
  }
  return {
    visible: labels.slice(0, maxVisible),
    hidden: labels.slice(maxVisible),
  };
}

export function localIsoDate(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export const DUE_DATE_PRESETS: readonly [label: string, days: number][] = [
  ["Today", 0],
  ["Tomorrow", 1],
  ["Next week", 7],
];
