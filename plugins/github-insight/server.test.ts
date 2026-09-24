import { describe, expect, it } from "vitest";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import pageOne from "./test/fixtures/pr-25337-overview-page-1.json";
import pageTwo from "./test/fixtures/pr-25337-overview-page-2.json";
import checkRunDetails from "./test/fixtures/pr-25337-check-run-details.json";
import plugin from "./server";

type PullRequestResult = Awaited<
  ReturnType<BbPluginApi["sdk"]["environments"]["pullRequest"]>
>;
type Environment = Awaited<
  ReturnType<BbPluginApi["sdk"]["environments"]["get"]>
>;

const availablePullRequest: PullRequestResult = {
  outcome: "available",
  pullRequest: {
    attention: "checks_failed",
    baseRefName: "main",
    checks: {
      failedCount: 1,
      passedCount: 98,
      pendingCount: 0,
      state: "failing",
      totalCount: 108,
    },
    headRefName: "feature",
    mergeability: {
      mergeStateStatus: "BLOCKED",
      mergeable: "MERGEABLE",
      state: "blocked",
    },
    number: 25337,
    review: { reviewRequestCount: 1, state: "review_required" },
    state: "open",
    title: "feat(*): add ootbDomainTypesIds constants",
    updatedAt: "2026-09-24T10:00:00Z",
    url: "https://github.com/collibra/frontend/pull/25337",
  },
};

async function setup(options: {
  environmentId: string | null;
  pullRequest?: PullRequestResult;
  hostPages?: (after: string | null) => unknown;
}) {
  const { bb, harness } = createFakePluginHost({
    pluginId: "github-insight",
    sdk: {
      threads: {
        get: async () =>
          makeThreadResponse({
            id: "thr_1",
            environmentId: options.environmentId,
          }),
      },
      environments: {
        pullRequest: async () =>
          options.pullRequest ?? { outcome: "absent" as const },
        get: async () => ({ hostId: "host-1" }) as Environment,
      },
    },
    experimental_callHostRpc: ({ method, input }) => {
      if (options.hostPages === undefined) throw new Error("unexpected call");
      if (method === "fetchCheckRunDetails") return checkRunDetails;
      const { after } = input as { after: string | null };
      return options.hostPages(after);
    },
  });
  await plugin(bb);
  return harness;
}

describe("getInsight", () => {
  it("reports no PR and makes no GitHub call for a thread without an environment", async () => {
    const harness = await setup({ environmentId: null });

    const result = await harness.behavior.callRpc("getInsight", {
      threadId: "thr_1",
    });

    expect(result).toEqual({ kind: "no_pr" });
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
  });

  it("reports no PR and makes no GitHub call when bb links no PR", async () => {
    const harness = await setup({ environmentId: "env_1" });

    const result = await harness.behavior.callRpc("getInsight", {
      threadId: "thr_1",
    });

    expect(result).toEqual({ kind: "no_pr" });
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
  });

  it("reads every contexts page and the failure details through the thread's host", async () => {
    const harness = await setup({
      environmentId: "env_1",
      pullRequest: availablePullRequest,
      hostPages: (after) => (after === null ? pageOne : pageTwo),
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
    });
  });

  it("reports the gh error text when the host call fails", async () => {
    const harness = await setup({
      environmentId: "env_1",
      pullRequest: availablePullRequest,
      hostPages: () => {
        throw new Error("gh: To get started with GitHub CLI, please run: gh auth login");
      },
    });

    const result = await harness.behavior.callRpc("getInsight", {
      threadId: "thr_1",
    });

    expect(result).toEqual({
      kind: "error",
      message: expect.stringContaining("gh auth login"),
    });
  });

  it("reports an error when bb cannot read the PR", async () => {
    const harness = await setup({
      environmentId: "env_1",
      pullRequest: { outcome: "unavailable", message: "gh not found" },
    });

    const result = await harness.behavior.callRpc("getInsight", {
      threadId: "thr_1",
    });

    expect(result).toEqual({ kind: "error", message: "gh not found" });
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
  });
});
