import { z } from "zod";
import {
  checkRunNodeSchema,
  checkSchema,
  failingCheckRunIds,
  type Check,
  latestCheckCandidates,
  statusContextNodeSchema,
  toCheck,
} from "./checks";
import {
  blockerSchema,
  buildBlockers,
  type Blocker,
  mergeableSchema,
  mergeStateStatusSchema,
  reviewDecisionSchema,
} from "./blockers";
import { parseFailureAnnotations, type Annotation } from "./failure";
import {
  buildReviewers,
  reviewerSchema,
  reviewNodeSchema,
  reviewRequestNodeSchema,
} from "./reviewers";

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

const reviewStateSchema = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z.object({
        mergeable: mergeableSchema,
        mergeStateStatus: mergeStateStatusSchema,
        reviewDecision: reviewDecisionSchema,
        reviewRequests: z.object({ nodes: z.array(reviewRequestNodeSchema) }),
        latestOpinionatedReviews: z.object({ nodes: z.array(reviewNodeSchema) }),
        reviewThreads: z.object({
          nodes: z.array(z.object({ isResolved: z.boolean() })),
        }),
      }),
    }),
  }),
});
type ReviewState = z.infer<typeof reviewStateSchema>["data"]["repository"]["pullRequest"];

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
  blockers: z.array(blockerSchema),
  reviewers: z.array(reviewerSchema),
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
): Promise<{ pages: [OverviewPage, ...OverviewPage[]]; reviewState: ReviewState }> {
  const firstResponse = await fetchOverviewPage(null);
  const first = overviewPageSchema.parse(firstResponse);
  const reviewState = reviewStateSchema.parse(firstResponse).data.repository.pullRequest;
  const pages: [OverviewPage, ...OverviewPage[]] = [first];
  let after = nextContextsCursor(first);
  while (after !== null && pages.length < MAX_CONTEXT_PAGES) {
    const page = overviewPageSchema.parse(await fetchOverviewPage(after));
    pages.push(page);
    after = nextContextsCursor(page);
  }
  return { pages, reviewState };
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

function blockers(
  reviewState: ReviewState,
  prState: PrInsight["pr"]["state"],
  checks: readonly Check[],
): Blocker[] {
  return buildBlockers({
    prState,
    mergeable: reviewState.mergeable,
    mergeStateStatus: reviewState.mergeStateStatus,
    reviewDecision: reviewState.reviewDecision,
    unresolvedThreads: reviewState.reviewThreads.nodes.filter(
      (thread) => !thread.isResolved,
    ).length,
    checkStatuses: checks.map((check) => check.status),
  });
}

export async function collectInsight(github: GitHubReader): Promise<PrInsight> {
  const { pages, reviewState } = await readOverviewPages(github.fetchOverviewPage);
  const latest = latestCheckCandidates(
    pages.flatMap((page) => contextsOf(page)?.nodes ?? []),
  );
  const annotations = await readFailureAnnotations(
    github.fetchCheckRunDetails,
    failingCheckRunIds(latest),
  );
  const pr = prHeader(pages[0]);
  const checks = latest.map((candidate) => toCheck(candidate, annotations));
  return {
    pr,
    blockers: blockers(reviewState, pr.state, checks),
    reviewers: buildReviewers(
      reviewState.reviewRequests.nodes,
      reviewState.latestOpinionatedReviews.nodes,
    ),
    checks,
  };
}
