import { z } from "zod";
import {
  checkRunNodeSchema,
  checkSchema,
  failingCheckRunIds,
  latestCheckCandidates,
  statusContextNodeSchema,
  toCheck,
} from "./checks";
import { parseFailureAnnotations, type Annotation } from "./failure";

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

export interface GitHubReader {
  fetchOverviewPage: (after: string | null) => Promise<unknown>;
  fetchCheckRunDetails: (ids: string[]) => Promise<unknown>;
}

async function readOverviewPages(
  fetchOverviewPage: GitHubReader["fetchOverviewPage"],
): Promise<[OverviewPage, ...OverviewPage[]]> {
  const first = overviewPageSchema.parse(await fetchOverviewPage(null));
  const pages: [OverviewPage, ...OverviewPage[]] = [first];
  let after = nextContextsCursor(first);
  while (after !== null && pages.length < MAX_CONTEXT_PAGES) {
    const page = overviewPageSchema.parse(await fetchOverviewPage(after));
    pages.push(page);
    after = nextContextsCursor(page);
  }
  return pages;
}

async function readFailureAnnotations(
  fetchCheckRunDetails: GitHubReader["fetchCheckRunDetails"],
  ids: string[],
): Promise<Map<string, Annotation[]>> {
  if (ids.length === 0) return new Map();
  return parseFailureAnnotations(await fetchCheckRunDetails(ids));
}

function prHeader(page: OverviewPage): PrInsight["pr"] {
  const pr = page.data.repository.pullRequest;
  const state = pr.isDraft && pr.state === "OPEN" ? "draft" : PR_STATE[pr.state];
  return { number: pr.number, title: pr.title, state, url: pr.url };
}

export async function collectInsight(github: GitHubReader): Promise<PrInsight> {
  const pages = await readOverviewPages(github.fetchOverviewPage);
  const latest = latestCheckCandidates(
    pages.flatMap((page) => contextsOf(page)?.nodes ?? []),
  );
  const annotations = await readFailureAnnotations(
    github.fetchCheckRunDetails,
    failingCheckRunIds(latest),
  );
  return {
    pr: prHeader(pages[0]),
    checks: latest.map((candidate) => toCheck(candidate, annotations)),
  };
}
