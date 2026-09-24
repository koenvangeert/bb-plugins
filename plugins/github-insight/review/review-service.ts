import type { Draft, Drafts } from "../core/drafts";
import { parsePrFiles, type ReviewFile } from "../core/pr-files";
import type { PullRequestRef } from "../core/pr-ref";
import { collectReviewThreads } from "../core/review-threads";
import type { ReviewUpdated } from "../core/review-updated";
import { placeThreads, type ThreadPlacement } from "../core/thread-placement";
import { GhFailureError, ghFailureText } from "../github/gh-failure";
import type { PrResolution, PrTarget } from "../pr-lookup";
import type { DraftStore } from "./draft-store";

export interface PrReview {
  files: ReviewFile[];
  threads: ThreadPlacement;
  drafts: Drafts;
}

export type ReviewLoad =
  | { kind: "no_pr" }
  | { kind: "error"; message: string }
  | { kind: "ok"; target: PrTarget; allThreadsRead: boolean; review: PrReview };

interface ReviewServiceDeps {
  resolvePr(threadId: string): Promise<PrResolution>;
  fetchPrFiles(target: PrTarget): Promise<unknown>;
  fetchReviewThreadsPage(target: PrTarget, after: string | null): Promise<unknown>;
  drafts: DraftStore;
  publish(update: ReviewUpdated): void;
}

export type ReviewService = ReturnType<typeof createReviewService>;

export function createReviewService(deps: ReviewServiceDeps) {
  async function load(threadId: string): Promise<ReviewLoad> {
    const resolution = await deps.resolvePr(threadId);
    if (resolution.kind !== "pr") return resolution;
    const { target } = resolution;
    try {
      const [files, collected] = await Promise.all([
        deps.fetchPrFiles(target).then(parsePrFiles),
        collectReviewThreads((after) => deps.fetchReviewThreadsPage(target, after)),
      ]);
      const drafts = await deps.drafts.liveDrafts(target.ref, collected);
      return {
        kind: "ok",
        target,
        allThreadsRead: collected.complete,
        review: { files, threads: placeThreads(files, collected.threads), drafts },
      };
    } catch (error) {
      if (error instanceof GhFailureError) {
        return { kind: "error", message: ghFailureText(error.failure) };
      }
      throw error;
    }
  }

  async function saveDraft(threadId: string, pr: PullRequestRef, reviewThreadId: string, draft: Draft) {
    await deps.drafts.save(pr, reviewThreadId, draft);
    deps.publish({ threadId });
  }

  return { load, saveDraft };
}
