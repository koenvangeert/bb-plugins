import { z } from "zod";
import {
  buildChecks,
  checkRunNodeSchema,
  checkSchema,
  statusContextNodeSchema,
} from "./checks";

export const MAX_CONTEXT_PAGES = 5;

const overviewPageSchema = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z.object({
        number: z.number(),
        title: z.string(),
        state: z.enum(["OPEN", "CLOSED", "MERGED"]),
        isDraft: z.boolean(),
        url: z.string(),
        commits: z.object({
          nodes: z.array(
            z.object({
              commit: z.object({
                statusCheckRollup: z
                  .object({
                    contexts: z.object({
                      pageInfo: z.object({
                        hasNextPage: z.boolean(),
                        endCursor: z.string().nullable(),
                      }),
                      nodes: z.array(
                        z.discriminatedUnion("__typename", [
                          checkRunNodeSchema,
                          statusContextNodeSchema,
                        ]),
                      ),
                    }),
                  })
                  .nullable(),
              }),
            }),
          ),
        }),
      }),
    }),
  }),
});
type OverviewPage = z.infer<typeof overviewPageSchema>;

const prStateSchema = z.enum(["open", "draft", "closed", "merged"]);
type PrState = z.infer<typeof prStateSchema>;

const PR_STATE: Record<OverviewPage["data"]["repository"]["pullRequest"]["state"], PrState> = {
  OPEN: "open",
  CLOSED: "closed",
  MERGED: "merged",
};

export const prInsightSchema = z.object({
  pr: z.object({
    number: z.number(),
    title: z.string(),
    state: prStateSchema,
    url: z.string(),
  }),
  checks: z.array(checkSchema),
});
export type PrInsight = z.infer<typeof prInsightSchema>;

function contextsOf(page: OverviewPage) {
  const [head] = page.data.repository.pullRequest.commits.nodes;
  return head?.commit.statusCheckRollup?.contexts ?? null;
}

function nextContextsCursor(page: OverviewPage): string | null {
  const contexts = contextsOf(page);
  if (contexts === null || !contexts.pageInfo.hasNextPage) return null;
  return contexts.pageInfo.endCursor;
}

function toInsight(first: OverviewPage, pages: readonly OverviewPage[]): PrInsight {
  const pr = first.data.repository.pullRequest;
  const state = pr.isDraft && pr.state === "OPEN" ? "draft" : PR_STATE[pr.state];
  return {
    pr: { number: pr.number, title: pr.title, state, url: pr.url },
    checks: buildChecks(pages.flatMap((page) => contextsOf(page)?.nodes ?? [])),
  };
}

export async function collectOverview(
  fetchPage: (after: string | null) => Promise<unknown>,
): Promise<PrInsight> {
  const first = overviewPageSchema.parse(await fetchPage(null));
  const pages = [first];
  let after = nextContextsCursor(first);
  while (after !== null && pages.length < MAX_CONTEXT_PAGES) {
    const page = overviewPageSchema.parse(await fetchPage(after));
    pages.push(page);
    after = nextContextsCursor(page);
  }
  return toInsight(first, pages);
}
