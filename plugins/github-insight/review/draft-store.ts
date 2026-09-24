import type { PluginKvStorage } from "@get-bb/plugin-sdk";
import { draftSchema, type Draft, type Drafts } from "../core/drafts";
import type { PullRequestRef } from "../core/pr-ref";
import type { CollectedReviewThreads } from "../core/review-threads";

export type DraftStore = ReturnType<typeof createDraftStore>;

function prefixOf({ owner, repo, number }: PullRequestRef): string {
  return `draft:${owner}/${repo}#${number}:`;
}

export function createDraftStore(kv: PluginKvStorage) {
  return {
    save: (pr: PullRequestRef, reviewThreadId: string, draft: Draft) =>
      kv.set(prefixOf(pr) + reviewThreadId, draft),

    async liveDrafts(pr: PullRequestRef, { threads, complete }: CollectedReviewThreads): Promise<Drafts> {
      const prefix = prefixOf(pr);
      const resolvedById = new Map(threads.map((thread) => [thread.id, thread.resolved]));
      const rows = await Promise.all(
        (await kv.list(prefix)).map(async (key) => ({
          key,
          reviewThreadId: key.slice(prefix.length),
          draft: draftSchema.safeParse(await kv.get(key)),
        })),
      );
      const drafts: Drafts = {};
      const staleKeys: string[] = [];
      for (const { key, reviewThreadId, draft } of rows) {
        const resolved = resolvedById.get(reviewThreadId);
        if (!draft.success || resolved === true || (resolved === undefined && complete)) staleKeys.push(key);
        else if (resolved === false) drafts[reviewThreadId] = draft.data;
      }
      await Promise.all(staleKeys.map((key) => kv.delete(key)));
      return drafts;
    },
  };
}
