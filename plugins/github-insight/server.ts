import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { hostContract, rpcContract, type GhResult, type ReviewResult } from "./contract";
import {
  INSIGHT_UPDATED_CHANNEL,
  type InsightUpdated,
} from "./core/insight-updated";
import { collectInsight } from "./core/overview";
import { parsePrFiles } from "./core/pr-files";
import { collectReviewThreads } from "./core/review-threads";
import { SUMMARY_METADATA_KEY } from "./core/summary";
import { placeThreads } from "./core/thread-placement";
import { ghFailureText } from "./github/gh-failure";
import { createPrLookup } from "./pr-lookup";
import { createInsightService, GhFailureError } from "./refresh/insight-service";

export type { rpcContract } from "./contract";

function unwrap(result: GhResult): unknown {
  if (!result.ok) throw new GhFailureError(result.failure);
  return result.data;
}

export default async function plugin(bb: BbPluginApi) {
  const host = bb.hosts.experimental_client({ contract: hostContract });
  const { resolvePr, resolveEnvironmentPr } = createPrLookup(bb.sdk);

  const service = createInsightService({
    listThreads: async () =>
      (await bb.sdk.threads.list()).filter((thread) => thread.archivedAt === null),
    resolvePr,
    resolveEnvironmentPr,
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

  async function getReview(threadId: string): Promise<ReviewResult> {
    const resolution = await resolvePr(threadId);
    if (resolution.kind !== "pr") return resolution;
    const { ref, hostId } = resolution.target;
    try {
      const [files, threads] = await Promise.all([
        host.call("fetchPrFiles", ref, { hostId }).then((result) => parsePrFiles(unwrap(result))),
        collectReviewThreads(async (after) =>
          unwrap(await host.call("fetchReviewThreads", { ...ref, after }, { hostId })),
        ),
      ]);
      return { kind: "ok", files, threads: placeThreads(files, threads) };
    } catch (error) {
      if (error instanceof GhFailureError) {
        return { kind: "error", message: ghFailureText(error.failure) };
      }
      throw error;
    }
  }

  bb.rpc.register(rpcContract, {
    getInsight: ({ threadId }) => service.getInsight(threadId),
    refresh: ({ threadId }) => service.refresh(threadId),
    getReview: ({ threadId }) => getReview(threadId),
  });

  bb.background.service("pr-poller", { start: (signal) => service.run(signal) });
}
