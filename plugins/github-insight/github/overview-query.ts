import type { OverviewPageRequest } from "../contract";

const OVERVIEW_QUERY = `
query ($owner: String!, $repo: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      number
      title
      state
      isDraft
      url
      commits(last: 1) {
        nodes {
          commit {
            statusCheckRollup {
              contexts(first: 100, after: $after) {
                pageInfo { hasNextPage endCursor }
                nodes {
                  __typename
                  ... on CheckRun { databaseId name status conclusion detailsUrl startedAt }
                  ... on StatusContext { context state targetUrl createdAt }
                }
              }
            }
          }
        }
      }
    }
  }
}
`;

// -f sends a raw string and -F coerces the value, so only the number uses -F.
export function overviewPageArgs(request: OverviewPageRequest): string[] {
  const args = [
    "api",
    "graphql",
    "-f",
    `query=${OVERVIEW_QUERY}`,
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
