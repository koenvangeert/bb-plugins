import { z } from "zod";

export const MAX_THREAD_PAGES = 5;

const threadsPageSchema = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z.object({
        reviewThreads: z.object({
          pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
          nodes: z.array(
            z.object({
              id: z.string(),
              isResolved: z.boolean(),
              isOutdated: z.boolean(),
              path: z.string(),
              line: z.number().nullable(),
              originalLine: z.number().nullable(),
              diffSide: z.enum(["LEFT", "RIGHT"]),
              comments: z.object({
                totalCount: z.number(),
                nodes: z.array(
                  z.object({
                    id: z.string(),
                    author: z.object({ login: z.string() }).nullable(),
                    body: z.string(),
                    createdAt: z.string(),
                    url: z.string(),
                    diffHunk: z.string(),
                  }),
                ),
              }),
            }),
          ),
        }),
      }),
    }),
  }),
});
type ThreadsPage = z.infer<typeof threadsPageSchema>;

export const reviewCommentSchema = z.object({
  id: z.string(),
  author: z.string(),
  body: z.string(),
  createdAt: z.string(),
  url: z.string(),
  diffHunk: z.string(),
});
export type ReviewComment = z.infer<typeof reviewCommentSchema>;

export const reviewThreadSchema = z.object({
  id: z.string(),
  resolved: z.boolean(),
  outdated: z.boolean(),
  path: z.string(),
  line: z.number().nullable(),
  originalLine: z.number().nullable(),
  side: z.enum(["LEFT", "RIGHT"]),
  comments: z.array(reviewCommentSchema),
  hasMoreComments: z.boolean(),
});
export type ReviewThread = z.infer<typeof reviewThreadSchema>;

const GHOST_AUTHOR = "ghost";

type ThreadNode = ThreadsPage["data"]["repository"]["pullRequest"]["reviewThreads"]["nodes"][number];

function toReviewThread(node: ThreadNode): ReviewThread {
  return {
    id: node.id,
    resolved: node.isResolved,
    outdated: node.isOutdated,
    path: node.path,
    line: node.line,
    originalLine: node.originalLine,
    side: node.diffSide,
    comments: node.comments.nodes.map((comment) => ({
      ...comment,
      author: comment.author?.login ?? GHOST_AUTHOR,
    })),
    hasMoreComments: node.comments.totalCount > node.comments.nodes.length,
  };
}

function threadsOf(page: ThreadsPage) {
  return page.data.repository.pullRequest.reviewThreads;
}

export function parseReviewThreads(pages: unknown[]): ReviewThread[] {
  return pages.flatMap((page) => threadsOf(threadsPageSchema.parse(page)).nodes.map(toReviewThread));
}

export interface CollectedReviewThreads {
  threads: ReviewThread[];
  complete: boolean;
}

export async function collectReviewThreads(
  fetchPage: (after: string | null) => Promise<unknown>,
): Promise<CollectedReviewThreads> {
  const pages: ThreadsPage[] = [];
  let after: string | null = null;
  do {
    const page = threadsPageSchema.parse(await fetchPage(after));
    pages.push(page);
    const { pageInfo } = threadsOf(page);
    after = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (after !== null && pages.length < MAX_THREAD_PAGES);
  return {
    threads: pages.flatMap((page) => threadsOf(page).nodes.map(toReviewThread)),
    complete: after === null,
  };
}
