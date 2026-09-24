import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { definePluginApp, experimental_NewThreadComposer as NewThreadComposer, useBbContext, useBbNavigate, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract, Task } from "./server";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";

const views = ["focus", "in-flight", "out-of-focus", "backlog", "done"] as const;
type View = typeof views[number];
const viewNames: Record<View, string> = {
  focus: "Focus", "in-flight": "In flight", "out-of-focus": "Out of focus", backlog: "Backlog", done: "Done",
};
const emptyCounts = { focus: 0, "in-flight": 0, "out-of-focus": 0, backlog: 0, done: 0 };
const fieldClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelClass = "mb-1 block text-xs font-medium text-muted-foreground";
const shortId = (id: string) => id.slice(0, 13);
const preview = (text: string) => text.trim().replace(/\s+/g, " ").slice(0, 180);
type TaskPatch = Partial<Pick<Task, "prompt" | "priority" | "status" | "focus" | "labels" | "dependsOn" | "threadId">> & { expectedUpdatedAt?: string };

type StartState = { canStart: boolean; reason: string | null; threadId: string | null; pending: boolean; active: boolean; launchToken: string | null };
function TaskForm({ task, tasks, busy, startState, onSave, onDelete, onCancel, onReload }: {
  task?: Task; tasks: Task[]; busy: boolean; startState: StartState | null; onSave: (input: TaskPatch) => Promise<void>;
  onDelete?: () => Promise<void>; onCancel: () => void; onReload: () => void;
}) {
  const original = useRef(task).current;
  const [prompt, setPrompt] = useState(task?.prompt ?? "");
  const [priority, setPriority] = useState<Task["priority"]>(task?.priority ?? "normal");
  const [status, setStatus] = useState<Task["status"]>(task?.status ?? "backlog");
  const [focus, setFocus] = useState<Task["focus"]>(task?.focus ?? "focus");
  const [labelText, setLabelText] = useState(task?.labels.join(", ") ?? "");
  const [dependsOn, setDependsOn] = useState<string[]>(task?.dependsOn ?? []);
  const [prerequisiteId, setPrerequisiteId] = useState("");
  const [threadId, setThreadId] = useState(task?.threadId ?? "");
  const [error, setError] = useState<string | null>(null);
  const navigate = useBbNavigate();
  const changedElsewhere = !!task && !!original && task.updatedAt !== original.updatedAt;
  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextLabels = [...new Set(labelText.split(",").map((item) => item.trim()).filter(Boolean))];
    const nextFocus = status === "doing" ? focus ?? "focus" : null;
    const nextThreadId = threadId.trim() || null;
    const patch: TaskPatch = original ? { expectedUpdatedAt: original.updatedAt } : { prompt };
    if (original) {
      if (prompt !== original.prompt) patch.prompt = prompt;
      if (priority !== original.priority) patch.priority = priority;
      if (status !== original.status) patch.status = status;
      if (nextFocus !== original.focus) patch.focus = nextFocus;
      if (labelText !== original.labels.join(", ") && JSON.stringify(nextLabels) !== JSON.stringify(original.labels)) patch.labels = nextLabels;
      if (JSON.stringify(dependsOn) !== JSON.stringify(original.dependsOn)) patch.dependsOn = dependsOn;
      if (nextThreadId !== original.threadId) patch.threadId = nextThreadId;
    }
    try { setError(null); await onSave(patch); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  return (
    <form onSubmit={submit} className="space-y-4 px-5 pb-8 pt-5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          {task ? <p className="text-xs font-medium text-primary">Task ID: <code className="select-all break-all">{task.id}</code></p> : <p className="text-xs font-medium text-primary">NEW TASK</p>}
          <h2 className="mt-1 text-lg font-semibold">{task ? "Task details" : "Create a task"}</h2>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Close</Button>
      </div>
      {task && <div className="flex items-center gap-2">
        {task.threadId || startState?.threadId ?
          <Button type="button" variant="outline" onClick={() => navigate.toThread((task.threadId ?? startState?.threadId)!)}>Open thread</Button> :
          startState?.pending ? <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">{startState.reason}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => navigate.toPluginPanel("tasks", { subPath: `start/${encodeURIComponent(task.id)}` })}>Review launch</Button>
          </div> : startState?.canStart ?
            <Button type="button" onClick={() => navigate.toPluginPanel("tasks", { subPath: `start/${encodeURIComponent(task.id)}` })}>Start</Button> :
            startState?.reason ? <p className="text-sm text-muted-foreground">{startState.reason}</p> : null}
      </div>}
      {changedElsewhere && <div className="rounded-md border border-border bg-muted p-3 text-xs">
        <p>This task changed elsewhere. Reload details to use the latest version; your draft will be discarded.</p>
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onReload}>Reload details</Button>
      </div>}
      <label><span className={labelClass}>Prompt</span><textarea autoFocus={!task} required className={`${fieldClass} min-h-40 resize-y`} value={prompt} maxLength={25000} onChange={(event) => setPrompt(event.target.value)} placeholder="What needs to happen?" /></label>
      {task && <div className="grid grid-cols-2 gap-3">
        <label><span className={labelClass}>Priority</span><select className={fieldClass} value={priority} onChange={(event) => setPriority(event.target.value as Task["priority"])}>
          {(["low", "normal", "high", "urgent"] as const).map((value) => <option key={value} value={value}>{value}</option>)}
        </select></label>
        <label><span className={labelClass}>Status</span><select className={fieldClass} value={status} onChange={(event) => setStatus(event.target.value as Task["status"])}>
          <option value="backlog">Backlog</option><option value="doing">In progress</option><option value="done">Done</option>
        </select></label>
      </div>}
      {task && <>
        {status === "doing" && <label><span className={labelClass}>Attention</span><select className={fieldClass} value={focus ?? "focus"} onChange={(event) => setFocus(event.target.value as Task["focus"])}>
          <option value="focus">Focus</option><option value="out-of-focus">Out of focus</option>
        </select></label>}
        <label><span className={labelClass}>Labels (comma-separated)</span><Input value={labelText} onChange={(event) => setLabelText(event.target.value)} placeholder="bug, ui" /></label>
        <div>
          <span className={labelClass}>Prerequisites</span>
          <div className="space-y-1 rounded-md border border-border p-2">
            {dependsOn.length === 0 && <p className="text-xs text-muted-foreground">No prerequisites yet.</p>}
            {dependsOn.map((id) => <div key={id} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate">{preview(tasks.find((item) => item.id === id)?.prompt ?? id)}</span>
              <Button type="button" variant="ghost" size="sm" aria-label={`Remove prerequisite ${id}`} onClick={() => setDependsOn((current) => current.filter((item) => item !== id))}>Remove</Button>
            </div>)}
          </div>
          <div className="mt-2 flex gap-2"><Input aria-label="Prerequisite task ID" value={prerequisiteId} onChange={(event) => setPrerequisiteId(event.target.value)} placeholder="TASK-…" />
            <Button type="button" variant="outline" size="sm" disabled={!prerequisiteId.trim()} onClick={() => {
              const id = prerequisiteId.trim();
              if (id !== task.id) setDependsOn((current) => current.includes(id) ? current : [...current, id]);
              setPrerequisiteId("");
            }}>Add</Button></div>
          <p className="mt-1 text-xs text-muted-foreground">Paste a task ID from this project. The server checks it when you save.</p>
        </div>
        <label><span className={labelClass}>Linked BB thread ID</span><Input value={threadId} onChange={(event) => setThreadId(event.target.value)} placeholder="thr_…" /></label>
      </>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-2 border-t border-border pt-4">
        <Button type="submit" disabled={busy || !prompt.trim()}>{busy ? "Saving…" : task ? "Save changes" : "Create task"}</Button>
        {task && onDelete && <Button type="button" variant="ghost" className="ml-auto text-destructive" disabled={busy} onClick={() => {
          if (window.confirm(`Delete task ${task.id}? This cannot be undone.`)) onDelete().catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
        }}>Delete</Button>}
      </div>
    </form>
  );
}

function TasksPage() {
  const rpc = useRpc<typeof rpcContract>();
  const context = useBbContext();
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [projectId, setProjectId] = useState<string | null>(context.projectId);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<View, number>>(emptyCounts);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("focus");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Task | null>(null);
  const [selectedStart, setSelectedStart] = useState<{ id: string; value: StartState } | null>(null);
  const selectedId = useRef<string | null>(null);
  const [formRevision, setFormRevision] = useState(0);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const refreshRequest = useRef(0);
  const report = useCallback((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)), []);
  useEffect(() => {
    rpc.call("tasks_projects").then(({ projects: found }) => {
      setProjects(found);
      setProjectId((current) => current && found.some((item) => item.id === current) ? current : found[0]?.id ?? null);
    }, report);
  }, [rpc, report]);
  const refresh = useCallback(() => {
    const request = ++refreshRequest.current;
    if (!projectId) { setTasks([]); setLoading(false); return; }
    rpc.call("tasks_list", { projectId, view, query, limit: 200, offset: 0 }).then(({ tasks: found, total: count, counts: nextCounts }) => {
      if (request !== refreshRequest.current) return;
      setTasks(found); setTotal(count); setCounts(nextCounts); setError(null); setLoading(false);
      const id = selectedId.current;
      if (id) rpc.call("tasks_get", { id }).then((detail) => {
        if (request === refreshRequest.current && selectedId.current === id) setSelected(detail);
      }, (cause) => { if (request === refreshRequest.current && selectedId.current === id) report(cause); });
    }, (cause) => { if (request === refreshRequest.current) { report(cause); setLoading(false); } });
  }, [rpc, projectId, view, query, report]);
  useEffect(() => { selectedId.current = null; setSelected(null); setCreating(false); }, [projectId]);
  useEffect(() => { setTasks([]); setTotal(0); setLoading(true); refresh(); }, [refresh]);
  useRealtime("tasks-changed", refresh);
  useEffect(() => {
    if (!selected) { setSelectedStart(null); return; }
    let active = true;
    setSelectedStart(null);
    rpc.call("tasks_start_state", { id: selected.id }).then((state) => {
      if (active && selectedId.current === selected.id) setSelectedStart({ id: selected.id, value: state });
    }, (cause) => { if (active) report(cause); });
    return () => { active = false; };
  }, [rpc, report, selected?.id, selected?.updatedAt]);
  const loadMore = async () => {
    if (!projectId || loadingMore) return;
    const request = refreshRequest.current;
    setLoadingMore(true);
    try {
      const result = await rpc.call("tasks_list", { projectId, view, query, offset: tasks.length, limit: 200 });
      if (request !== refreshRequest.current) return;
      setTasks((existing) => [...existing, ...result.tasks.filter((item) => !existing.some((old) => old.id === item.id))]);
      setTotal(result.total); setCounts(result.counts);
    } catch (cause) { if (request === refreshRequest.current) report(cause); } finally { setLoadingMore(false); }
  };
  async function save(input: TaskPatch) {
    if (!projectId) return;
    setBusy(true);
    try {
      if (selected) {
        const updated = await rpc.call("tasks_update", { id: selected.id, ...input });
        if (selectedId.current === selected.id) { setSelected(updated); setFormRevision((value) => value + 1); }
      } else {
        if (!input.prompt?.trim()) throw new Error("Enter a prompt");
        const created = await rpc.call("tasks_create", { projectId, prompt: input.prompt });
        selectedId.current = created.id; setSelected(created); setCreating(false); setFormRevision((value) => value + 1);
        setView("backlog");
      }
      refresh();
    } finally { setBusy(false); }
  }
  async function remove() {
    if (!selected) return;
    setBusy(true);
    try { await rpc.call("tasks_remove", { id: selected.id }); selectedId.current = null; setSelected(null); refresh(); }
    finally { setBusy(false); }
  }
  const panelOpen = creating || !!selected;
  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 md:px-6">
        <div className="mr-auto min-w-0"><h1 className="text-base font-semibold">Tasks</h1><p className="text-xs text-muted-foreground">Plan work here. Run agents in BB threads.</p></div>
        <select aria-label="Project" className={`${fieldClass} w-auto max-w-52`} value={projectId ?? ""} onChange={(event) => setProjectId(event.target.value)}>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        <Button disabled={!projectId} onClick={() => { selectedId.current = null; setSelected(null); setCreating(true); }}><Icon name="Plus" className="size-4" /> New task</Button>
      </header>
      <nav aria-label="Task views" className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-4 py-2 md:px-6">
        {views.map((item) => <button key={item} type="button" onClick={() => setView(item)} aria-current={view === item ? "page" : undefined}
          className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${view === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
          {viewNames[item]} <span className="ml-1 text-xs opacity-70">{counts[item]}</span>
        </button>)}
      </nav>
      {error && <p role="alert" className="border-b border-destructive/30 bg-destructive/10 px-5 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex min-h-0 flex-1">
        <main className={`${panelOpen ? "hidden md:flex" : "flex"} min-w-0 flex-1 flex-col`}>
          <div className="border-b border-border px-4 py-3 md:px-6"><Input aria-label="Search tasks" placeholder="Search tasks and labels" value={query} maxLength={200} onChange={(event) => setQuery(event.target.value)} /></div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
            <h2 className="mb-3 text-sm font-semibold">{viewNames[view]} <span className="ml-1 text-muted-foreground">{total}</span></h2>
            {loading ? <p className="text-sm text-muted-foreground">Loading tasks…</p> : tasks.length === 0 ?
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No tasks here. Create one or choose another view.</div> :
              <ul className="space-y-2">{tasks.map((task) => <li key={task.id}>
                <button type="button" onClick={() => { selectedId.current = task.id; setSelected(task); setCreating(false); }} aria-pressed={selected?.id === task.id}
                  className={`w-full rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50 ${selected?.id === task.id ? "border-primary" : "border-border"}`}>
                  <span className="flex items-center justify-between gap-3"><span className="text-xs font-medium text-primary">{shortId(task.id)}</span><span className="text-xs capitalize text-muted-foreground">{task.priority}</span></span>
                  <span className="mt-2 block truncate font-medium">{preview(task.prompt)}</span>
                  {(task.labels.length > 0 || task.dependsOn.length > 0 || task.threadId) && <span className="mt-3 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                    {task.labels.map((label) => <span key={label} className="rounded-full bg-muted px-2 py-0.5">{label}</span>)}
                    {task.dependsOn.length > 0 && <span>{task.dependsOn.length} prerequisite{task.dependsOn.length === 1 ? "" : "s"}</span>}
                    {task.threadId && <span>Linked thread</span>}
                  </span>}
                </button>
              </li>)}</ul>}
            {tasks.length < total && <Button type="button" variant="outline" className="mt-4" disabled={loadingMore} onClick={loadMore}>{loadingMore ? "Loading…" : `Load more (${tasks.length} of ${total})`}</Button>}
          </div>
        </main>
        {panelOpen && <aside className="min-h-0 w-full overflow-y-auto border-l border-border bg-card md:w-[min(40%,450px)]">
          <TaskForm key={`${selected?.id ?? "new"}:${formRevision}`} task={selected ?? undefined} tasks={tasks} busy={busy} startState={selected && selectedStart?.id === selected.id ? selectedStart.value : null} onSave={save} onDelete={selected ? remove : undefined}
            onReload={() => setFormRevision((value) => value + 1)} onCancel={() => { selectedId.current = null; setSelected(null); setCreating(false); }} />
        </aside>}
      </div>
    </div>
  );
}

function StartTaskPage({ id }: { id: string }) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [task, setTask] = useState<Task | null>(null);
  const [state, setState] = useState<StartState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [knownThreadId, setKnownThreadId] = useState("");
  const [resolving, setResolving] = useState(false);
  const refreshRequest = useRef(0);
  const refresh = useCallback(() => {
    const request = ++refreshRequest.current;
    rpc.call("tasks_start_state", { id }).then((result) => rpc.call("tasks_get", { id }).then((detail) => {
      if (request === refreshRequest.current) { setState(result); setTask(detail); setError(null); }
    })).catch((cause) => { if (request === refreshRequest.current) setError(cause instanceof Error ? cause.message : String(cause)); });
  }, [id, rpc]);
  useEffect(() => {
    setTask(null); setState(null); setError(null);
    refresh();
    return () => { ++refreshRequest.current; };
  }, [refresh]);
  useRealtime("tasks-changed", refresh);
  async function resolvePending(action: "link" | "release") {
    if (!state?.pending || !state.launchToken || state.active || resolving) return;
    if (action === "release" && !window.confirm("I verified no task thread was created. Releasing this claim could cause duplicate work if BB is still finishing the first launch. Release it?")) return;
    setResolving(true); setError(null);
    try {
      const input = action === "link"
        ? { id, expectedLaunchToken: state.launchToken, action, threadId: knownThreadId.trim() } as const
        : { id, expectedLaunchToken: state.launchToken, action, confirmed: true } as const;
      await rpc.call("tasks_resolve_launch", input);
      setKnownThreadId("");
      refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setResolving(false); }
  }
  return <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
    <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 md:px-6">
      <Button type="button" variant="outline" size="sm" onClick={() => navigate.toPluginPanel("tasks")}>Back to tasks</Button>
      <h1 className="text-base font-semibold">Start task</h1>
    </header>
    <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!error && !task && <p className="text-sm text-muted-foreground">Loading task…</p>}
        {task && <><p className="text-sm text-muted-foreground">Task <code className="select-all">{task.id}</code></p>
          {state?.threadId ? <Button type="button" onClick={() => navigate.toThread(state.threadId!)}>Open thread</Button> :
            state?.reason ? <p className="text-sm text-muted-foreground">{state.reason}</p> : null}
          {state?.pending && <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={refresh}>Recheck</Button>
            {state.active && <span className="text-xs text-muted-foreground">Thread creation is still active.</span>}
          </div>}
          {state?.pending && !state.active && <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <p className="text-sm">If you know which thread started, link it here. Otherwise, verify BB did not create one before releasing the claim. A delayed thread could still appear; releasing it may allow duplicate work on your next submission. This will not delete a thread.</p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-48 flex-1"><span className={labelClass}>Known thread ID</span><Input aria-label="Known thread ID" value={knownThreadId} onChange={(event) => setKnownThreadId(event.target.value)} placeholder="thr_…" /></label>
              <Button type="button" variant="outline" size="sm" disabled={resolving || !knownThreadId.trim()} onClick={() => void resolvePending("link")}>Link thread</Button>
              <Button type="button" variant="outline" size="sm" disabled={resolving} onClick={() => void resolvePending("release")}>Release claim</Button>
            </div>
          </div>}
          {state?.canStart && <>
            <p className="text-sm text-muted-foreground">This thread must stay in the task's project. Review the prompt, model, environment, and permissions before starting.</p>
            {submitError && <p role="alert" className="text-sm text-destructive">{submitError}</p>}
            <NewThreadComposer key={task.id} initialPrompt={task.prompt} defaultProjectId={task.projectId}
              draftKey={`task-board:start:${task.id}`} layout="document" className="w-full"
              onSubmit={async (request) => {
                setSubmitError(null);
                try {
                  const result = await rpc.call("tasks_start", { id: task.id, request });
                  navigate.toThread(result.threadId);
                } catch (cause) {
                  setSubmitError(cause instanceof Error ? cause.message : String(cause));
                  throw cause;
                }
              }} />
          </>}
        </>}
      </div>
    </main>
  </div>;
}

function TasksPanel({ subPath }: { subPath: string }) {
  if (!subPath.startsWith("start/")) return <TasksPage />;
  let id: string;
  try { id = decodeURIComponent(subPath.slice("start/".length)); }
  catch { return <p role="alert">Invalid task link.</p>; }
  return id ? <StartTaskPage key={id} id={id} /> : <p role="alert">Invalid task link.</p>;
}

export default definePluginApp((app) => {
  app.slots.navPanel({ id: "tasks", title: "Tasks", icon: "ListTodo", path: "tasks", component: TasksPanel });
});
