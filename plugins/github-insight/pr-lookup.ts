import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { parsePullRequestUrl, type PullRequestRef } from "./core/pr-ref";

export interface PrTarget {
  ref: PullRequestRef;
  hostId: string;
  openOnBb: boolean;
}

export type PrResolution =
  | { kind: "no_pr" }
  | { kind: "error"; message: string }
  | { kind: "pr"; target: PrTarget };

export function createPrLookup(sdk: Pick<BbPluginApi["sdk"], "threads" | "environments">) {
  async function resolveEnvironmentPr(environmentId: string): Promise<PrResolution> {
    const [linked, environment] = await Promise.all([
      sdk.environments.pullRequest({ environmentId }),
      sdk.environments.get({ environmentId }),
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

  async function resolvePr(threadId: string): Promise<PrResolution> {
    const { environmentId } = await sdk.threads.get({ threadId });
    if (environmentId === null) return { kind: "no_pr" };
    return resolveEnvironmentPr(environmentId);
  }

  return { resolvePr, resolveEnvironmentPr };
}
