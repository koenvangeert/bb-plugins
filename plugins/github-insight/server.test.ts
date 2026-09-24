import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pageOne from "./test/fixtures/pr-25337-overview-page-1.json";
import pageTwo from "./test/fixtures/pr-25337-overview-page-2.json";
import checkRunDetails from "./test/fixtures/pr-25337-check-run-details.json";
import prFiles from "./test/fixtures/pr-25259-files.json";
import reviewThreads from "./test/fixtures/pr-25259-review-threads.json";
import type { ReviewResult } from "./contract";
import type { PrSummary } from "./core/summary";
import { failed, linkedPr, ok, setup, type HostCall, type PullRequestResult } from "./test/plugin-harness";

function withPrState(state: "OPEN" | "MERGED" | "CLOSED") {
  return {
    ...pageOne,
    data: {
      repository: {
        pullRequest: { ...pageOne.data.repository.pullRequest, state },
      },
    },
  };
}

function pages(first: unknown = pageOne) {
  return ({ method, input }: HostCall) => {
    if (method === "fetchCheckRunDetails") return ok(checkRunDetails);
    const { after } = input as { after: string | null };
    return ok(after === null ? first : pageTwo);
  };
}

function overviewRefreshes(harness: Awaited<ReturnType<typeof setup>>) {
  return harness.experimental_hostRpcCalls.filter(
    (call) =>
      call.method === "fetchOverviewPage" &&
      (call.input as { after: string | null }).after === null,
  );
}

interface MetadataUpdate {
  threadId: string;
  pluginId: string;
  set?: { prSummary: PrSummary };
  remove?: string[];
}

function metadataUpdates(harness: Awaited<ReturnType<typeof setup>>) {
  return harness.sdk
    .callsTo("threads.updatePluginMetadata")
    .map(([args]) => args as MetadataUpdate);
}

async function settle() {
  for (let round = 0; round < 5; round++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("getInsight", () => {
  it("reports no PR and makes no GitHub call for a thread without an environment", async () => {
    const harness = await setup({ threads: [{ id: "thr_1", environmentId: null }] });

    const result = await harness.behavior.callRpc("getInsight", {
      threadId: "thr_1",
    });

    expect(result).toEqual({ kind: "no_pr" });
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
  });

  it("reports no PR and makes no GitHub call when bb links no PR", async () => {
    const harness = await setup({ threads: [{ id: "thr_1", environmentId: "env_1" }] });

    const result = await harness.behavior.callRpc("getInsight", {
      threadId: "thr_1",
    });

    expect(result).toEqual({ kind: "no_pr" });
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
  });

  it("reads every contexts page and the failure details through the thread's host", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: pages(),
    });

    const result = await harness.behavior.callRpc("getInsight", {
      threadId: "thr_1",
    });

    expect(harness.experimental_hostRpcCalls).toEqual([
      expect.objectContaining({
        method: "fetchOverviewPage",
        hostId: "host-1",
        input: { owner: "collibra", repo: "frontend", number: 25337, after: null },
      }),
      expect.objectContaining({
        input: { owner: "collibra", repo: "frontend", number: 25337, after: "MTAw" },
      }),
      expect.objectContaining({
        method: "fetchCheckRunDetails",
        hostId: "host-1",
        input: { ids: ["CR_kwDOHI7l-88AAAAZCnAPSQ", "CR_kwDOHI7l-88AAAAZCnoC7g"] },
      }),
    ]);
    expect(result).toMatchObject({
      kind: "ok",
      insight: { pr: { number: 25337, state: "open" } },
      error: null,
    });
  });

  it("reuses the last refresh instead of calling GitHub again", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: pages(),
    });

    await harness.behavior.callRpc("getInsight", { threadId: "thr_1" });
    await harness.behavior.callRpc("getInsight", { threadId: "thr_1" });

    expect(overviewRefreshes(harness)).toHaveLength(1);
  });

  it.each([
    [{ kind: "gh_missing" } as const, "gh not installed"],
    [{ kind: "gh_logged_out" } as const, "gh not logged in"],
    [{ kind: "rate_limited", resetAt: null } as const, "rate limited"],
  ])("names the gh failure %j", async (failure, message) => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: () => failed(failure),
    });

    const result = await harness.behavior.callRpc("getInsight", {
      threadId: "thr_1",
    });

    expect(result).toEqual({ kind: "error", message });
  });

  it("reports an error when bb cannot read the PR", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: { outcome: "unavailable", message: "gh not found" } },
    });

    const result = await harness.behavior.callRpc("getInsight", {
      threadId: "thr_1",
    });

    expect(result).toEqual({ kind: "error", message: "gh not found" });
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
  });
});

describe("refresh", () => {
  it("calls GitHub again at once and returns the new data", async () => {
    let first: unknown = pageOne;
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: (call) => pages(first)(call),
    });
    await harness.behavior.callRpc("getInsight", { threadId: "thr_1" });
    first = withPrState("MERGED");

    const result = await harness.behavior.callRpc("refresh", { threadId: "thr_1" });

    expect(overviewRefreshes(harness)).toHaveLength(2);
    expect(result).toMatchObject({
      kind: "ok",
      insight: { pr: { state: "merged" } },
    });
  });

  it("keeps the last good data with its time when a refresh fails", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-24T10:00:00Z") });
    let host: (call: HostCall) => unknown = pages();
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: (call) => host(call),
    });
    await harness.behavior.callRpc("getInsight", { threadId: "thr_1" });
    vi.setSystemTime(new Date("2026-09-24T10:05:00Z"));
    host = () => failed({ kind: "gh_logged_out" });

    const result = await harness.behavior.callRpc("refresh", { threadId: "thr_1" });

    expect(result).toMatchObject({
      kind: "ok",
      insight: { pr: { number: 25337 } },
      refreshedAt: Date.parse("2026-09-24T10:00:00Z"),
      error: "gh not logged in",
    });
  });

  it("does not tell open tabs when a refresh finds the same data", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: pages(),
    });
    await harness.behavior.callRpc("refresh", { threadId: "thr_1" });

    await harness.behavior.callRpc("refresh", { threadId: "thr_1" });

    expect(harness.realtimeSignals).toHaveLength(1);
  });
});

describe("pr-poller", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "Date"],
      now: new Date("2026-09-24T10:00:00Z"),
    });
  });

  async function advance(ms: number) {
    await vi.advanceTimersByTimeAsync(ms);
    await settle();
  }

  it("refreshes an open PR every 60 seconds", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: pages(),
    });

    const run = harness.behavior.runService("pr-poller");
    await settle();
    expect(overviewRefreshes(harness)).toHaveLength(1);

    await advance(59_999);
    expect(overviewRefreshes(harness)).toHaveLength(1);

    await advance(1);
    expect(overviewRefreshes(harness)).toHaveLength(2);
    run.controller.abort();
  });

  it("tells open tabs of every thread on the PR that the data changed", async () => {
    const harness = await setup({
      threads: [
        { id: "thr_1", environmentId: "env_1" },
        { id: "thr_2", environmentId: "env_2" },
      ],
      pullRequests: { env_1: linkedPr(25337), env_2: linkedPr(25337) },
      host: pages(),
    });
    const run = harness.behavior.runService("pr-poller");
    await settle();

    expect(harness.realtimeSignals).toEqual([
      { channel: "insight.updated", payload: { threadIds: ["thr_1", "thr_2"] } },
    ]);
    run.controller.abort();
  });

  it("refreshes a PR once when several threads share it", async () => {
    const harness = await setup({
      threads: [
        { id: "thr_1", environmentId: "env_1" },
        { id: "thr_2", environmentId: "env_1" },
        { id: "thr_3", environmentId: "env_2" },
        { id: "thr_4", environmentId: null },
      ],
      pullRequests: { env_1: linkedPr(25337), env_2: linkedPr(25337) },
      host: pages(),
    });

    const run = harness.behavior.runService("pr-poller");
    await settle();

    expect(overviewRefreshes(harness)).toHaveLength(1);
    run.controller.abort();
  });

  it("runs at most 4 refreshes at the same time", async () => {
    const pending: Array<() => void> = [];
    const threads = [1, 2, 3, 4, 5, 6].map((index) => ({
      id: `thr_${index}`,
      environmentId: `env_${index}`,
    }));
    const harness = await setup({
      threads,
      pullRequests: Object.fromEntries(
        threads.map((thread, index) => [thread.environmentId, linkedPr(index + 1)]),
      ),
      host: (call) => {
        const { after } = call.input as { after?: string | null };
        if (after !== null) return pages()(call);
        return new Promise((resolve) => {
          pending.push(() => resolve(pages()(call)));
        });
      },
    });

    const run = harness.behavior.runService("pr-poller");
    await settle();
    expect(overviewRefreshes(harness)).toHaveLength(4);

    pending.shift()!();
    await settle();
    expect(overviewRefreshes(harness)).toHaveLength(5);
    run.controller.abort();
  });

  it("stops refreshing a merged PR after one last refresh that records it", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337, "merged") },
      host: pages(withPrState("MERGED")),
    });

    const run = harness.behavior.runService("pr-poller");
    await settle();
    await advance(120_000);

    expect(overviewRefreshes(harness)).toHaveLength(1);
    expect(
      await harness.behavior.callRpc("getInsight", { threadId: "thr_1" }),
    ).toMatchObject({ kind: "ok", insight: { pr: { state: "merged" } } });
    run.controller.abort();
  });

  it("refreshes a closed PR again when bb reports it open again", async () => {
    const pullRequests = { env_1: linkedPr(25337, "closed") };
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests,
      host: pages(withPrState("CLOSED")),
    });
    const run = harness.behavior.runService("pr-poller");
    await settle();

    pullRequests.env_1 = linkedPr(25337, "open");
    await advance(60_000);

    expect(overviewRefreshes(harness)).toHaveLength(2);
    run.controller.abort();
  });

  it("waits until the reset time after a rate limit", async () => {
    let host = (_call: HostCall): unknown =>
      failed({ kind: "rate_limited", resetAt: Date.now() + 10 * 60_000 });
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: (call) => host(call),
    });

    const run = harness.behavior.runService("pr-poller");
    await settle();
    host = pages();
    await advance(10 * 60_000 - 1);
    expect(overviewRefreshes(harness)).toHaveLength(1);

    await advance(1);
    expect(overviewRefreshes(harness)).toHaveLength(2);
    run.controller.abort();
  });

  it("waits 5 minutes after a rate limit without a reset time", async () => {
    let host = (_call: HostCall): unknown =>
      failed({ kind: "rate_limited", resetAt: null });
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: (call) => host(call),
    });

    const run = harness.behavior.runService("pr-poller");
    await settle();
    host = pages();
    await advance(5 * 60_000 - 1);
    expect(overviewRefreshes(harness)).toHaveLength(1);

    await advance(1);
    expect(overviewRefreshes(harness)).toHaveLength(2);
    run.controller.abort();
  });

  it("keeps the latest reset time when refreshes in one poll disagree", async () => {
    const threads = [1, 2].map((index) => ({
      id: `thr_${index}`,
      environmentId: `env_${index}`,
    }));
    let host = ({ input }: HostCall): unknown =>
      failed({
        kind: "rate_limited",
        resetAt: (input as { number: number }).number === 1 ? Date.now() + 40 * 60_000 : null,
      });
    const harness = await setup({
      threads,
      pullRequests: { env_1: linkedPr(1), env_2: linkedPr(2) },
      host: (call) => host(call),
    });

    const run = harness.behavior.runService("pr-poller");
    await settle();
    host = pages();
    await advance(10 * 60_000);

    expect(overviewRefreshes(harness)).toHaveLength(2);
    run.controller.abort();
  });

  it("lets the user refresh while the poller waits on a rate limit", async () => {
    let host = (_call: HostCall): unknown => failed({ kind: "rate_limited", resetAt: null });
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: (call) => host(call),
    });
    const run = harness.behavior.runService("pr-poller");
    await settle();
    host = pages();

    const result = await harness.behavior.callRpc("refresh", { threadId: "thr_1" });

    expect(result).toMatchObject({ kind: "ok", error: null });
    run.controller.abort();
  });

  it("does not call GitHub for a newly opened tab while the poller waits on a rate limit", async () => {
    const harness = await setup({
      threads: [
        { id: "thr_1", environmentId: "env_1" },
        { id: "thr_2", environmentId: "env_2" },
      ],
      pullRequests: { env_1: linkedPr(1), env_2: linkedPr(2) },
      host: () => failed({ kind: "rate_limited", resetAt: null }),
    });
    const run = harness.behavior.runService("pr-poller");
    await settle();
    const callsBefore = harness.experimental_hostRpcCalls.length;

    const result = await harness.behavior.callRpc("getInsight", { threadId: "thr_2" });

    expect(result).toEqual({ kind: "error", message: "rate limited" });
    expect(harness.experimental_hostRpcCalls).toHaveLength(callsBefore);
    run.controller.abort();
  });

  it("tells a thread that joins a running refresh when it finishes", async () => {
    let finish: () => void = () => {};
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }, { id: "thr_2", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: (call) => {
        const { after } = call.input as { after?: string | null };
        if (after !== null) return pages()(call);
        return new Promise((resolve) => {
          finish = () => resolve(pages()(call));
        });
      },
    });
    const first = harness.behavior.callRpc("refresh", { threadId: "thr_1" });
    await settle();
    const second = harness.behavior.callRpc("refresh", { threadId: "thr_2" });
    await settle();

    finish();
    await Promise.all([first, second]);

    expect(harness.realtimeSignals).toEqual([
      { channel: "insight.updated", payload: { threadIds: ["thr_1", "thr_2"] } },
    ]);
  });

  it("skips the rest of a poll once GitHub rate-limits it", async () => {
    const threads = [1, 2, 3, 4, 5, 6].map((index) => ({
      id: `thr_${index}`,
      environmentId: `env_${index}`,
    }));
    const harness = await setup({
      threads,
      pullRequests: Object.fromEntries(
        threads.map((thread, index) => [thread.environmentId, linkedPr(index + 1)]),
      ),
      host: () => failed({ kind: "rate_limited", resetAt: null }),
    });

    const run = harness.behavior.runService("pr-poller");
    await settle();

    expect(overviewRefreshes(harness)).toHaveLength(4);
    run.controller.abort();
  });

  it("ends when the plugin stops", async () => {
    const harness = await setup({ threads: [] });

    const run = harness.behavior.runService("pr-poller");
    await settle();
    run.controller.abort();

    await expect(run.done).resolves.toBeUndefined();
  });
});

describe("prSummary metadata", () => {
  it("writes the summary to the metadata of every thread on the PR", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-24T10:00:00Z") });
    const harness = await setup({
      threads: [
        { id: "thr_1", environmentId: "env_1" },
        { id: "thr_2", environmentId: "env_2" },
      ],
      pullRequests: { env_1: linkedPr(25337), env_2: linkedPr(25337) },
      host: pages(),
    });
    const run = harness.behavior.runService("pr-poller");
    await settle();

    expect(metadataUpdates(harness)).toEqual(
      ["thr_1", "thr_2"].map((threadId) => ({
        threadId,
        pluginId: "github-insight",
        set: {
          prSummary: expect.objectContaining({
            version: 1,
            updatedAt: "2026-09-24T10:00:00.000Z",
            pr: { number: 25337, url: "https://github.com/collibra/frontend/pull/25337", state: "open" },
            error: null,
          }),
        },
      })),
    );
    run.controller.abort();
  });

  it("does not write when a refresh finds the same summary", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: pages(),
    });
    await harness.behavior.callRpc("refresh", { threadId: "thr_1" });

    await harness.behavior.callRpc("refresh", { threadId: "thr_1" });

    expect(metadataUpdates(harness)).toHaveLength(1);
  });

  it("writes the newer refresh time every 30 minutes when the data stays the same", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "Date"],
      now: new Date("2026-09-24T10:00:00Z"),
    });
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: pages(),
    });
    const run = harness.behavior.runService("pr-poller");
    await settle();

    await vi.advanceTimersByTimeAsync(29 * 60_000);
    await settle();
    expect(metadataUpdates(harness)).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(60_000);
    await settle();
    expect(metadataUpdates(harness)).toHaveLength(2);
    expect(metadataUpdates(harness)[1]).toMatchObject({
      set: { prSummary: { updatedAt: "2026-09-24T10:30:00.000Z" } },
    });
    run.controller.abort();
  });

  it("keeps the last good data and sets the error when a refresh fails", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-24T10:00:00Z") });
    let host: (call: HostCall) => unknown = pages();
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: (call) => host(call),
    });
    await harness.behavior.callRpc("refresh", { threadId: "thr_1" });
    vi.setSystemTime(new Date("2026-09-24T10:05:00Z"));
    host = () => failed({ kind: "rate_limited", resetAt: null });

    await harness.behavior.callRpc("refresh", { threadId: "thr_1" });

    const [good, failing] = metadataUpdates(harness).map((update) => update.set?.prSummary);
    expect(failing).toEqual({ ...good, error: "rate limited" });
  });

  it("puts a fixed error text in the summary instead of raw gh output", async () => {
    let host: (call: HostCall) => unknown = pages();
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: (call) => host(call),
    });
    await harness.behavior.callRpc("refresh", { threadId: "thr_1" });
    host = () => failed({ kind: "failed", message: "HTTP 502 from api.github.com" });

    const result = await harness.behavior.callRpc("refresh", { threadId: "thr_1" });

    expect(result).toMatchObject({ error: "HTTP 502 from api.github.com" });
    expect(metadataUpdates(harness)[1]?.set?.prSummary.error).toBe("refresh failed");
  });

  it("removes the old summary when the first refresh of a thread's new PR fails", async () => {
    const pullRequests: Record<string, PullRequestResult> = { env_1: linkedPr(1) };
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests,
      host: (call) =>
        (call.input as { number?: number }).number === 2
          ? failed({ kind: "gh_logged_out" })
          : pages()(call),
    });
    await harness.behavior.callRpc("refresh", { threadId: "thr_1" });
    pullRequests.env_1 = linkedPr(2);

    await harness.behavior.callRpc("refresh", { threadId: "thr_1" });

    expect(metadataUpdates(harness)[1]).toEqual({
      threadId: "thr_1",
      pluginId: "github-insight",
      remove: ["prSummary"],
    });
  });

  it("removes the summary once when bb no longer links a PR to the thread", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "Date"],
      now: new Date("2026-09-24T10:00:00Z"),
    });
    const pullRequests: Record<string, PullRequestResult> = { env_1: linkedPr(25337) };
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests,
      host: pages(),
    });
    const run = harness.behavior.runService("pr-poller");
    await settle();

    pullRequests.env_1 = { outcome: "absent" };
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    await settle();

    expect(metadataUpdates(harness).slice(1)).toEqual([
      { threadId: "thr_1", pluginId: "github-insight", remove: ["prSummary"] },
    ]);
    run.controller.abort();
  });

  it("removes the summary of a thread without an environment", async () => {
    const harness = await setup({ threads: [{ id: "thr_1", environmentId: null }] });

    const run = harness.behavior.runService("pr-poller");
    await settle();
    run.controller.abort();

    expect(metadataUpdates(harness)).toEqual([
      { threadId: "thr_1", pluginId: "github-insight", remove: ["prSummary"] },
    ]);
  });

  it("keeps the summary when bb cannot read the PR", async () => {
    const pullRequests: Record<string, PullRequestResult> = { env_1: linkedPr(25337) };
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests,
      host: pages(),
    });
    await harness.behavior.callRpc("refresh", { threadId: "thr_1" });
    pullRequests.env_1 = { outcome: "unavailable", message: "gh not found" };

    await harness.behavior.callRpc("refresh", { threadId: "thr_1" });

    expect(metadataUpdates(harness)).toHaveLength(1);
  });

  it("still returns the insight when the metadata write fails", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: pages(),
    });
    harness.sdk.stub("threads.updatePluginMetadata", async () => {
      throw new Error("HTTP 500");
    });

    const result = await harness.behavior.callRpc("refresh", { threadId: "thr_1" });

    expect(result).toMatchObject({ kind: "ok", error: null });
  });
});

describe("getReview", () => {
  function recordedReviewHost({ method }: HostCall) {
    return ok(method === "fetchPrFiles" ? prFiles : reviewThreads);
  }

  it("reports no PR and makes no GitHub call when bb links no PR", async () => {
    const harness = await setup({ threads: [{ id: "thr_1", environmentId: "env_1" }] });

    const result = await harness.behavior.callRpc("getReview", { threadId: "thr_1" });

    expect(result).toEqual({ kind: "no_pr" });
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
  });

  it("reads the PR files and review threads through the thread's host", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25259) },
      host: recordedReviewHost,
    });

    await harness.behavior.callRpc("getReview", { threadId: "thr_1" });

    const pr = { owner: "collibra", repo: "frontend", number: 25259 };
    expect(harness.experimental_hostRpcCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: "fetchPrFiles", hostId: "host-1", input: pr }),
        expect.objectContaining({
          method: "fetchReviewThreads",
          hostId: "host-1",
          input: { ...pr, after: null },
        }),
      ]),
    );
  });

  it("returns the files and places the threads on their lines", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25259) },
      host: recordedReviewHost,
    });

    const result = (await harness.behavior.callRpc("getReview", {
      threadId: "thr_1",
    })) as ReviewResult;

    if (result.kind !== "ok") throw new Error(`expected ok, got ${result.kind}`);
    expect(result.files.map((file) => file.path)).toEqual([
      "apps/shell/e2e/catalog/integrations/components/asset/generic-configuration/createDatabricksOutboundSyncConfigurationComponent.ts",
      "apps/shell/e2e/catalog/integrations/components/helpers/clickWithScrollHelper.ts",
      "apps/shell/e2e/utils/elements/createTreeGrid.ts",
    ]);
    expect(result.threads.placed.map(({ thread, lineNumber }) => [thread.id, lineNumber])).toEqual([
      ["PRRT_kwDOHI7l-86jxqt3", 151],
      ["PRRT_kwDOHI7l-86jxula", 46],
    ]);
    expect(result.threads.outdated.map((thread) => thread.id)).toEqual([
      "PRRT_kwDOHI7l-86jvKxS",
      "PRRT_kwDOHI7l-86jx0SN",
    ]);
  });

  it.each(["fetchPrFiles", "fetchReviewThreads"])(
    "names the gh failure when %s fails",
    async (failing) => {
      const harness = await setup({
        threads: [{ id: "thr_1", environmentId: "env_1" }],
        pullRequests: { env_1: linkedPr(25259) },
        host: (call) => (call.method === failing ? failed({ kind: "gh_logged_out" }) : recordedReviewHost(call)),
      });

      const result = await harness.behavior.callRpc("getReview", { threadId: "thr_1" });

      expect(result).toEqual({ kind: "error", message: "gh not logged in" });
    },
  );

  it("calls GitHub again on each load", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25259) },
      host: recordedReviewHost,
    });

    await harness.behavior.callRpc("getReview", { threadId: "thr_1" });
    await harness.behavior.callRpc("getReview", { threadId: "thr_1" });

    expect(harness.experimental_hostRpcCalls).toHaveLength(4);
  });
});
