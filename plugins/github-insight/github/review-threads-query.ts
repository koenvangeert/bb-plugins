import type { PrPageRequest } from "../contract";

const REVIEW_THREADS_QUERY = `
query ($owner: String!, $repo: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          originalLine
          diffSide
          comments(first: 100) {
            totalCount
            nodes { id author { login } body createdAt url diffHunk }
          }
        }
      }
    }
  }
}
`;

export function reviewThreadsPageArgs(request: PrPageRequest): string[] {
  const args = [
    "api",
    "graphql",
    "-f",
    `query=${REVIEW_THREADS_QUERY}`,
    "-f",
    `owner=${request.owner}`,
    "-f",
    `repo=${request.repo}`,
    "-F",
    `number=${request.number}`,
  ];
  if (request.after !== null) args.push("-f", `after=${request.after}`);
  return args;
}
