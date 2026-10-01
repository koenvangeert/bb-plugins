import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { hostContract, rpcContract, type GhResult, type ReviewResult } from "./contract";
import {
  INSIGHT_UPDATED_CHANNEL,
  type InsightUpdated,
} from "./core/insight-updated";
import { collectInsight } from "./core/overview";
import { REVIEW_UPDATED_CHANNEL } from "./core/review-updated";
import { SUMMARY_METADATA_KEY } from "./core/summary";
import { GhFailureError } from "./github/gh-failure";
import { createPrLookup } from "./pr-lookup";
import { createInsightService } from "./refresh/insight-service";
import { createDraftStore } from "./review/draft-store";
import { createReviewCli } from "./review/review-cli";
import { createReviewService } from "./review/review-service";

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

  const review = createReviewService({
    resolvePr,
    fetchPrFiles: async ({ ref, hostId }) => unwrap(await host.call("fetchPrFiles", ref, { hostId })),
    fetchReviewThreadsPage: async ({ ref, hostId }, after) =>
      unwrap(await host.call("fetchReviewThreads", { ...ref, after }, { hostId })),
    drafts: createDraftStore(bb.storage.kv),
    publish: (update) => bb.realtime.publish(REVIEW_UPDATED_CHANNEL, update),
    sendMessage: async (threadId, text) => {
      const result = await bb.sdk.threads.send({ threadId, mode: "auto", input: [{ type: "text", text, mentions: [] }] });
      return result.delivery;
    },
  });

  async function getReview(threadId: string): Promise<ReviewResult> {
    const load = await review.load(threadId);
    return load.kind === "ok" ? { kind: "ok", ...load.review } : load;
  }

  bb.rpc.register(rpcContract, {
    getInsight: ({ threadId }) => service.getInsight(threadId),
    refresh: ({ threadId }) => service.refresh(threadId),
    getReview: ({ threadId }) => getReview(threadId),
    sendToAgent: ({ threadId, reviewThreadIds }) => review.sendToAgent(threadId, reviewThreadIds),
  });

  bb.cli.register(
    createReviewCli({
      review,
      readTextFile: (hostId, request) => host.call("readTextFile", request, { hostId }),
      now: Date.now,
    }),
  );

  bb.background.service("pr-poller", { start: (signal) => service.run(signal) });
}
