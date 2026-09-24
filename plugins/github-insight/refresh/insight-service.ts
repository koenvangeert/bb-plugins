import type { InsightResult } from "../contract";
import type { PrInsight } from "../core/overview";
import type { PullRequestRef } from "../core/pr-ref";
import {
  buildSummary,
  shouldWriteSummary,
  type PrSummary,
  type WrittenSummary,
} from "../core/summary";
import { GhFailureError, ghFailureText } from "../github/gh-failure";
import type { PrResolution, PrTarget } from "../pr-lookup";

export const POLL_INTERVAL_MS = 60_000;
export const MAX_PARALLEL_REFRESHES = 4;
export const RATE_LIMIT_FALLBACK_MS = 5 * 60_000;

export interface ThreadRef {
  id: string;
  environmentId: string | null;
}

export interface InsightServiceDeps {
  listThreads(): Promise<ThreadRef[]>;
  resolvePr(threadId: string): Promise<PrResolution>;
  resolveEnvironmentPr(environmentId: string): Promise<PrResolution>;
  fetchInsight(target: PrTarget): Promise<PrInsight>;
  publish(threadIds: string[]): void;
  writeSummary(threadId: string, summary: PrSummary): Promise<void>;
  removeSummary(threadId: string): Promise<void>;
  warn(message: string): void;
}

type CacheEntry = (
  | { good: { insight: PrInsight; refreshedAt: number }; error: string | null }
  | { good: null; error: string }
) & { summaryError: string | null; threadIds: Set<string> };

interface PrGroup {
  target: PrTarget;
  threadIds: Set<string>;
}

interface ThreadsByPr {
  groups: PrGroup[];
  threadIdsWithoutPr: string[];
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

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Other plugins and agents can read the summary, so it gets a fixed text
// instead of raw gh stderr.
function summaryErrorText(error: unknown): string {
  return error instanceof GhFailureError && error.failure.kind !== "failed"
    ? error.message
    : "refresh failed";
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
  const writtenSummaries = new Map<string, WrittenSummary>();
  const removedSummaries = new Set<string>();
  let pausedUntil = 0;

  const isPaused = () => Date.now() < pausedUntil;

  function pauseAfter(error: unknown) {
    if (error instanceof GhFailureError && error.failure.kind === "rate_limited") {
      const until = error.failure.resetAt ?? Date.now() + RATE_LIMIT_FALLBACK_MS;
      pausedUntil = Math.max(pausedUntil, until);
    }
  }

  async function writeSummaries(summary: PrSummary, threadIds: Iterable<string>) {
    const now = Date.now();
    await Promise.all(
      [...threadIds].map(async (threadId) => {
        if (!shouldWriteSummary(writtenSummaries.get(threadId), summary, now)) return;
        try {
          await deps.writeSummary(threadId, summary);
          writtenSummaries.set(threadId, { summary, writtenAt: now });
          removedSummaries.delete(threadId);
        } catch (error) {
          deps.warn(`PR summary write for thread ${threadId} failed: ${errorText(error)}`);
        }
      }),
    );
  }

  async function removeSummaries(threadIds: Iterable<string>) {
    await Promise.all(
      [...threadIds].map(async (threadId) => {
        if (removedSummaries.has(threadId)) return;
        try {
          await deps.removeSummary(threadId);
          removedSummaries.add(threadId);
          writtenSummaries.delete(threadId);
        } catch (error) {
          deps.warn(`PR summary removal for thread ${threadId} failed: ${errorText(error)}`);
        }
      }),
    );
  }

  function syncSummaries(entry: CacheEntry): Promise<void> {
    if (entry.good === null) return removeSummaries(entry.threadIds);
    const summary = buildSummary({ ...entry.good, error: entry.summaryError });
    return writeSummaries(summary, entry.threadIds);
  }

  async function runRefresh(key: string, group: PrGroup): Promise<CacheEntry> {
    const previous = entries.get(key);
    let next: CacheEntry;
    try {
      const insight = await deps.fetchInsight(group.target);
      next = {
        good: { insight, refreshedAt: Date.now() },
        error: null,
        summaryError: null,
        threadIds: group.threadIds,
      };
    } catch (error) {
      pauseAfter(error);
      const message = errorText(error);
      deps.warn(`PR insight for ${key} failed: ${message}`);
      const failure = { summaryError: summaryErrorText(error), threadIds: group.threadIds };
      next = previous?.good
        ? { good: previous.good, error: message, ...failure }
        : { good: null, error: message, ...failure };
    }
    entries.set(key, next);
    if (!sameData(previous, next)) deps.publish([...next.threadIds]);
    await syncSummaries(next);
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

  async function groupThreadsByPr(): Promise<ThreadsByPr> {
    const threadsByEnvironment = new Map<string, string[]>();
    const threadIdsWithoutPr: string[] = [];
    for (const thread of await deps.listThreads()) {
      if (thread.environmentId === null) {
        threadIdsWithoutPr.push(thread.id);
        continue;
      }
      const threads = threadsByEnvironment.get(thread.environmentId) ?? [];
      threads.push(thread.id);
      threadsByEnvironment.set(thread.environmentId, threads);
    }
    const groups = new Map<string, PrGroup>();
    await Promise.all(
      [...threadsByEnvironment].map(async ([environmentId, threadIds]) => {
        const resolution = await deps.resolveEnvironmentPr(environmentId);
        if (resolution.kind === "no_pr") threadIdsWithoutPr.push(...threadIds);
        if (resolution.kind !== "pr") return;
        const key = prKey(resolution.target.ref);
        const group = groups.get(key) ?? { target: resolution.target, threadIds: new Set() };
        for (const threadId of threadIds) group.threadIds.add(threadId);
        groups.set(key, group);
      }),
    );
    return { groups: [...groups.values()], threadIdsWithoutPr };
  }

  async function poll(): Promise<void> {
    if (isPaused()) return;
    const { groups, threadIdsWithoutPr } = await groupThreadsByPr();
    const due = groups.filter((group) => !isSettled(group.target));
    await Promise.all([
      removeSummaries(threadIdsWithoutPr),
      forEachLimited(due, MAX_PARALLEL_REFRESHES, async (group) => {
        if (!isPaused()) await refreshPr(group);
      }),
    ]);
  }

  async function refreshThread(threadId: string, target: PrTarget): Promise<CacheEntry> {
    const threadIds = new Set(entries.get(prKey(target.ref))?.threadIds);
    threadIds.add(threadId);
    return refreshPr({ target, threadIds });
  }

  return {
    async getInsight(threadId: string): Promise<InsightResult> {
      const resolution = await deps.resolvePr(threadId);
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
      const resolution = await deps.resolvePr(threadId);
      if (resolution.kind !== "pr") return resolution;
      return toResult(await refreshThread(threadId, resolution.target));
    },

    async run(signal: AbortSignal): Promise<void> {
      while (!signal.aborted) {
        try {
          await poll();
        } catch (error) {
          deps.warn(`PR poll failed: ${errorText(error)}`);
        }
        await sleep(Math.max(POLL_INTERVAL_MS, pausedUntil - Date.now()), signal);
      }
    },
  };
}
