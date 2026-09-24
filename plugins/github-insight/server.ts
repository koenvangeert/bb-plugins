import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { hostContract, rpcContract, type InsightResult } from "./contract";
import { collectInsight } from "./core/overview";
import { parsePullRequestUrl } from "./core/pr-ref";

export type { rpcContract } from "./contract";

export default async function plugin(bb: BbPluginApi) {
  const host = bb.hosts.experimental_client({ contract: hostContract });

  async function getInsight(threadId: string): Promise<InsightResult> {
    const thread = await bb.sdk.threads.get({ threadId });
    const { environmentId } = thread;
    if (environmentId === null) return { kind: "no_pr" };

    const [linked, environment] = await Promise.all([
      bb.sdk.environments.pullRequest({ environmentId }),
      bb.sdk.environments.get({ environmentId }),
    ]);
    if (linked.outcome === "absent") return { kind: "no_pr" };
    if (linked.outcome === "unavailable") {
      return { kind: "error", message: linked.message };
    }

    const ref = parsePullRequestUrl(linked.pullRequest.url);
    if (ref === null) {
      return {
        kind: "error",
        message: `Not a github.com pull request: ${linked.pullRequest.url}`,
      };
    }

    const { hostId } = environment;
    try {
      const insight = await collectInsight({
        fetchOverviewPage: (after) =>
          host.call("fetchOverviewPage", { ...ref, after }, { hostId }),
        fetchCheckRunDetails: (ids) =>
          host.call("fetchCheckRunDetails", { ids }, { hostId }),
      });
      return { kind: "ok", insight };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      bb.log.warn(`PR insight for thread ${threadId} failed: ${message}`);
      return { kind: "error", message };
    }
  }

  bb.rpc.register(rpcContract, {
    getInsight: ({ threadId }) => getInsight(threadId),
  });
}
