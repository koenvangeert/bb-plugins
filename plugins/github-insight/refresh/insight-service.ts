import type { InsightResult } from "../contract";
import type { PrInsight } from "../core/overview";
import type { PullRequestRef } from "../core/pr-ref";
import { ghFailureText, type GhFailure } from "../github/gh-failure";

export const POLL_INTERVAL_MS = 60_000;
export const MAX_PARALLEL_REFRESHES = 4;
export const RATE_LIMIT_FALLBACK_MS = 5 * 60_000;

export interface PrTarget {
  ref: PullRequestRef;
  hostId: string;
  openOnBb: boolean;
}

export type PrResolution =
  | { kind: "no_pr" }
  | { kind: "error"; message: string }
  | { kind: "pr"; target: PrTarget };

export interface ThreadRef {
  id: string;
  environmentId: string | null;
}

export class GhFailureError extends Error {
  constructor(readonly failure: GhFailure) {
    super(ghFailureText(failure));
  }
}

export interface InsightServiceDeps {
  listThreads(): Promise<ThreadRef[]>;
  threadEnvironment(threadId: string): Promise<string | null>;
  resolvePr(environmentId: string): Promise<PrResolution>;
  fetchInsight(target: PrTarget): Promise<PrInsight>;
  publish(threadIds: string[]): void;
  warn(message: string): void;
}

type CacheEntry = (
  | { good: { insight: PrInsight; refreshedAt: number }; error: string | null }
  | { good: null; error: string }
) & { threadIds: Set<string> };

interface PrGroup {
  target: PrTarget;
  threadIds: Set<string>;
}

function prKey({ owner, repo, number }: PullRequestRef): string {
  return `${owner}/${repo}#${number}`;
}

function toResult(entry: CacheEntry): InsightResult {
  if (entry.good === null) return { kind: "error", message: entry.error };
  return { kind: "ok", ...entry.good, error: entry.error };
}

function sameData(previous: CacheEntry | undefined, next: CacheEntry): boolean {
  if (previous === undefined) return false;
  const data = (entry: CacheEntry) =>
    JSON.stringify({ insight: entry.good?.insight ?? null, error: entry.error });
  return data(previous) === data(next);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}

async function forEachLimited<T>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const worker = async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      await run(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, worker));
}

export function createInsightService(deps: InsightServiceDeps) {
  const entries = new Map<string, CacheEntry>();
  const running = new Map<string, { group: PrGroup; done: Promise<CacheEntry> }>();
  let pausedUntil = 0;

  const isPaused = () => Date.now() < pausedUntil;

  function pauseAfter(error: unknown) {
    if (error instanceof GhFailureError && error.failure.kind === "rate_limited") {
      const until = error.failure.resetAt ?? Date.now() + RATE_LIMIT_FALLBACK_MS;
      pausedUntil = Math.max(pausedUntil, until);
    }
  }

  async function runRefresh(key: string, group: PrGroup): Promise<CacheEntry> {
    const previous = entries.get(key);
    let next: CacheEntry;
    try {
      const insight = await deps.fetchInsight(group.target);
      next = {
        good: { insight, refreshedAt: Date.now() },
        error: null,
        threadIds: group.threadIds,
      };
    } catch (error) {
      pauseAfter(error);
      const message = error instanceof Error ? error.message : String(error);
      deps.warn(`PR insight for ${key} failed: ${message}`);
      next = previous?.good
        ? { good: previous.good, error: message, threadIds: group.threadIds }
        : { good: null, error: message, threadIds: group.threadIds };
    }
    entries.set(key, next);
    if (!sameData(previous, next)) deps.publish([...next.threadIds]);
    return next;
  }

  function refreshPr(group: PrGroup): Promise<CacheEntry> {
    const key = prKey(group.target.ref);
    const current = running.get(key);
    if (current !== undefined) {
      for (const threadId of group.threadIds) current.group.threadIds.add(threadId);
      return current.done;
    }
    const done = runRefresh(key, group).finally(() => running.delete(key));
    running.set(key, { group, done });
    return done;
  }

  function isSettled(target: PrTarget): boolean {
    const state = entries.get(prKey(target.ref))?.good?.insight.pr.state;
    return !target.openOnBb && (state === "merged" || state === "closed");
  }

  async function groupThreadsByPr(): Promise<PrGroup[]> {
    const threadsByEnvironment = new Map<string, string[]>();
    for (const thread of await deps.listThreads()) {
      if (thread.environmentId === null) continue;
      const threads = threadsByEnvironment.get(thread.environmentId) ?? [];
      threads.push(thread.id);
      threadsByEnvironment.set(thread.environmentId, threads);
    }
    const groups = new Map<string, PrGroup>();
    await Promise.all(
      [...threadsByEnvironment].map(async ([environmentId, threadIds]) => {
        const resolution = await deps.resolvePr(environmentId);
        if (resolution.kind !== "pr") return;
        const key = prKey(resolution.target.ref);
        const group = groups.get(key) ?? { target: resolution.target, threadIds: new Set() };
        for (const threadId of threadIds) group.threadIds.add(threadId);
        groups.set(key, group);
      }),
    );
    return [...groups.values()];
  }

  async function poll(): Promise<void> {
    if (isPaused()) return;
    const due = (await groupThreadsByPr()).filter((group) => !isSettled(group.target));
    await forEachLimited(due, MAX_PARALLEL_REFRESHES, async (group) => {
      if (!isPaused()) await refreshPr(group);
    });
  }

  async function resolveThread(threadId: string): Promise<PrResolution> {
    const environmentId = await deps.threadEnvironment(threadId);
    if (environmentId === null) return { kind: "no_pr" };
    return deps.resolvePr(environmentId);
  }

  async function refreshThread(threadId: string, target: PrTarget): Promise<CacheEntry> {
    const threadIds = new Set(entries.get(prKey(target.ref))?.threadIds);
    threadIds.add(threadId);
    return refreshPr({ target, threadIds });
  }

  return {
    async getInsight(threadId: string): Promise<InsightResult> {
      const resolution = await resolveThread(threadId);
      if (resolution.kind !== "pr") return resolution;
      const entry = entries.get(prKey(resolution.target.ref));
      if (entry !== undefined) {
        entry.threadIds.add(threadId);
        return toResult(entry);
      }
      if (isPaused()) {
        return { kind: "error", message: ghFailureText({ kind: "rate_limited", resetAt: null }) };
      }
      return toResult(await refreshThread(threadId, resolution.target));
    },

    async refresh(threadId: string): Promise<InsightResult> {
      const resolution = await resolveThread(threadId);
      if (resolution.kind !== "pr") return resolution;
      return toResult(await refreshThread(threadId, resolution.target));
    },

    async run(signal: AbortSignal): Promise<void> {
      while (!signal.aborted) {
        try {
          await poll();
        } catch (error) {
          deps.warn(`PR poll failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        await sleep(Math.max(POLL_INTERVAL_MS, pausedUntil - Date.now()), signal);
      }
    },
  };
}
