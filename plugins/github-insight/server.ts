import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { hostContract, rpcContract, type GhResult } from "./contract";
import {
  INSIGHT_UPDATED_CHANNEL,
  type InsightUpdated,
} from "./core/insight-updated";
import { collectInsight } from "./core/overview";
import { parsePullRequestUrl } from "./core/pr-ref";
import { SUMMARY_METADATA_KEY } from "./core/summary";
import {
  createInsightService,
  GhFailureError,
  type PrResolution,
} from "./refresh/insight-service";

export type { rpcContract } from "./contract";

function unwrap(result: GhResult): unknown {
  if (!result.ok) throw new GhFailureError(result.failure);
  return result.data;
}

export default async function plugin(bb: BbPluginApi) {
  const host = bb.hosts.experimental_client({ contract: hostContract });

  async function resolvePr(environmentId: string): Promise<PrResolution> {
    const [linked, environment] = await Promise.all([
      bb.sdk.environments.pullRequest({ environmentId }),
      bb.sdk.environments.get({ environmentId }),
    ]);
    if (linked.outcome === "absent") return { kind: "no_pr" };
    if (linked.outcome === "unavailable") {
      return { kind: "error", message: linked.message };
    }
    const { url, state } = linked.pullRequest;
    const ref = parsePullRequestUrl(url);
    if (ref === null) {
      return { kind: "error", message: `Not a github.com pull request: ${url}` };
    }
    return {
      kind: "pr",
      target: {
        ref,
        hostId: environment.hostId,
        openOnBb: state === "open" || state === "draft",
      },
    };
  }

  const service = createInsightService({
    listThreads: async () =>
      (await bb.sdk.threads.list()).filter((thread) => thread.archivedAt === null),
    threadEnvironment: async (threadId) =>
      (await bb.sdk.threads.get({ threadId })).environmentId,
    resolvePr,
    fetchInsight: ({ ref, hostId }) =>
      collectInsight({
        fetchOverviewPage: async (after) =>
          unwrap(await host.call("fetchOverviewPage", { ...ref, after }, { hostId })),
        fetchCheckRunDetails: async (ids) =>
          unwrap(await host.call("fetchCheckRunDetails", { ids }, { hostId })),
      }),
    publish: (threadIds) =>
      bb.realtime.publish(INSIGHT_UPDATED_CHANNEL, { threadIds } satisfies InsightUpdated),
    writeSummary: async (threadId, summary) => {
      await bb.sdk.threads.updatePluginMetadata({
        threadId,
        set: { [SUMMARY_METADATA_KEY]: summary },
      });
    },
    removeSummary: async (threadId) => {
      await bb.sdk.threads.updatePluginMetadata({ threadId, remove: [SUMMARY_METADATA_KEY] });
    },
    warn: (message) => bb.log.warn(message),
  });

  bb.rpc.register(rpcContract, {
    getInsight: ({ threadId }) => service.getInsight(threadId),
    refresh: ({ threadId }) => service.refresh(threadId),
  });

  bb.background.service("pr-poller", { start: (signal) => service.run(signal) });
}
