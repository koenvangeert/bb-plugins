import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { GhFailure } from "../github/gh-failure";
import plugin from "../server";

export type PullRequestResult = Awaited<
  ReturnType<BbPluginApi["sdk"]["environments"]["pullRequest"]>
>;
type AvailablePullRequest = Extract<PullRequestResult, { outcome: "available" }>;
type Environment = Awaited<
  ReturnType<BbPluginApi["sdk"]["environments"]["get"]>
>;
type ThreadListItem = Awaited<
  ReturnType<BbPluginApi["sdk"]["threads"]["list"]>
>[number];
export interface HostCall {
  method: string;
  input: unknown;
}

export function linkedPr(
  number: number,
  state: AvailablePullRequest["pullRequest"]["state"] = "open",
): AvailablePullRequest {
  return {
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
      number,
      review: { reviewRequestCount: 1, state: "review_required" },
      state,
      title: "feat(*): add ootbDomainTypesIds constants",
      updatedAt: "2026-09-24T10:00:00Z",
      url: `https://github.com/collibra/frontend/pull/${number}`,
    },
  };
}

export function ok(data: unknown) {
  return { ok: true as const, data };
}

export function failed(failure: GhFailure) {
  return { ok: false as const, failure };
}

export async function setup(options: {
  threads: { id: string; environmentId: string | null }[];
  pullRequests?: Record<string, PullRequestResult>;
  host?: (call: HostCall) => unknown;
}) {
  const threadResponse = (id: string) => {
    const thread = options.threads.find((candidate) => candidate.id === id)!;
    return makeThreadResponse(thread);
  };
  const { bb, harness } = createFakePluginHost({
    pluginId: "github-insight",
    sdk: {
      threads: {
        get: async ({ threadId }) => threadResponse(threadId),
        list: async () =>
          options.threads.map(
            ({ id }) => threadResponse(id) as unknown as ThreadListItem,
          ),
        updatePluginMetadata: async () => ({}),
      },
      environments: {
        pullRequest: async ({ environmentId }) =>
          options.pullRequests?.[environmentId] ?? { outcome: "absent" as const },
        get: async () => ({ hostId: "host-1" }) as Environment,
      },
    },
    experimental_callHostRpc: (call) => {
      if (options.host === undefined) throw new Error("unexpected call");
      return options.host(call);
    },
  });
  await plugin(bb);
  return harness;
}
