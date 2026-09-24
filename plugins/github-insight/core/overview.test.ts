import { describe, expect, it } from "vitest";
import pageOne from "../test/fixtures/pr-25337-overview-page-1.json";
import pageTwo from "../test/fixtures/pr-25337-overview-page-2.json";
import checkRunDetails from "../test/fixtures/pr-25337-check-run-details.json";
import { MAX_CONTEXT_PAGES, collectInsight, type GitHubReader } from "./overview";

const recordedPages: Record<string, unknown> = { start: pageOne, MTAw: pageTwo };

function recordedGitHub(overrides: Partial<GitHubReader> = {}): GitHubReader {
  return {
    fetchOverviewPage: async (after) => recordedPages[after ?? "start"],
    fetchCheckRunDetails: async () => checkRunDetails,
    ...overrides,
  };
}

function onlyPassingChecksPage() {
  return {
    data: {
      repository: {
        pullRequest: {
          ...pageOne.data.repository.pullRequest,
          commits: {
            nodes: [
              {
                commit: {
                  statusCheckRollup: {
                    contexts: {
                      pageInfo: { hasNextPage: false, endCursor: null },
                      nodes: pageOne.data.repository.pullRequest.commits.nodes[0]!.commit.statusCheckRollup.contexts.nodes.filter(
                        (node) => node.conclusion === "SUCCESS",
                      ),
                    },
                  },
                },
              },
            ],
          },
        },
      },
    },
  };
}

describe("collectInsight on PR 25337", () => {
  it("gives the PR header", async () => {
    const insight = await collectInsight(recordedGitHub());

    expect(insight.pr).toEqual({
      number: 25337,
      title:
        "feat(*): add ootbDomainTypesIds constants and replace hardcoded domain type UUIDs",
      state: "open",
      url: "https://github.com/collibra/frontend/pull/25337",
    });
  });

  it("gives one check per name across both pages", async () => {
    const insight = await collectInsight(recordedGitHub());
    const names = insight.checks.map((check) => check.name);

    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("Storybook Publish");
  });

  it("shows re-runs after a cancel as passed", async () => {
    const insight = await collectInsight(recordedGitHub());
    const build = insight.checks.find(
      (check) => check.name === "trigger-testing / build / build",
    );

    expect(build?.status).toBe("passed");
  });

  it("counts the newest run of every check by status", async () => {
    const insight = await collectInsight(recordedGitHub());
    const counts: Record<string, number> = {};
    for (const check of insight.checks) {
      counts[check.status] = (counts[check.status] ?? 0) + 1;
    }

    expect(counts).toMatchInlineSnapshot(`
      {
        "cancelled": 1,
        "failed": 1,
        "passed": 98,
        "skipped": 8,
      }
    `);
  });

  it("asks annotations only for the newest failed and cancelled check runs", async () => {
    const requested: string[][] = [];

    await collectInsight(
      recordedGitHub({
        fetchCheckRunDetails: async (ids) => {
          requested.push(ids);
          return checkRunDetails;
        },
      }),
    );

    expect(requested).toEqual([
      ["CR_kwDOHI7l-88AAAAZCnAPSQ", "CR_kwDOHI7l-88AAAAZCnoC7g"],
    ]);
  });

  it("gives the failed Actions check its annotation as reason", async () => {
    const insight = await collectInsight(recordedGitHub());
    const a11y = insight.checks.find(
      (check) => check.name === "trigger-testing / a11y-test (1) / a11y-test",
    );

    expect(a11y).toEqual({
      name: "trigger-testing / a11y-test (1) / a11y-test",
      status: "failed",
      url: "https://github.com/collibra/frontend/actions/runs/35973768789/job/107549950702",
      failure: {
        reason: "Process completed with exit code 1.",
        annotations: [
          { path: ".github", line: 4092, message: "Process completed with exit code 1." },
        ],
        annotationCount: 1,
      },
    });
  });

  it("keeps the link of a cancelled check without reason text", async () => {
    const insight = await collectInsight(recordedGitHub());
    const e2e = insight.checks.find((check) => check.name === "run-e2e-tests-v4");

    expect(e2e).toMatchObject({
      status: "cancelled",
      url: expect.stringContaining("/job/107549298505"),
      failure: { reason: "", annotations: [], annotationCount: 0 },
    });
  });

  it("lists the pending code owner teams before the approvals", async () => {
    const insight = await collectInsight(recordedGitHub());

    expect(insight.reviewers.slice(0, 2)).toEqual([
      { name: "workflows-frontend", kind: "team", state: "pending", codeOwner: true },
      {
        name: "semantic-model-ontology-frontend",
        kind: "team",
        state: "pending",
        codeOwner: true,
      },
    ]);
    expect(insight.reviewers).toContainEqual({
      name: "koenvangeert",
      kind: "user",
      state: "approved",
      codeOwner: false,
    });
    expect(insight.reviewers).toHaveLength(11);
  });

  it("gives the merge blockers of a branch that is behind and needs review", async () => {
    const insight = await collectInsight(recordedGitHub());

    expect(insight.blockers).toEqual([
      { code: "checks_failed", text: "1 check failed" },
      { code: "behind", text: "Branch out of date" },
      { code: "review_required", text: "Review required" },
    ]);
  });

  it("skips the detail query when nothing failed or was cancelled", async () => {
    let detailCalls = 0;

    const insight = await collectInsight(
      recordedGitHub({
        fetchOverviewPage: async () => onlyPassingChecksPage(),
        fetchCheckRunDetails: async () => {
          detailCalls += 1;
          return checkRunDetails;
        },
      }),
    );

    expect(insight.checks.length).toBeGreaterThan(0);
    expect(detailCalls).toBe(0);
  });
});

describe("collectInsight paging", () => {
  it("follows the contexts cursor to the last page", async () => {
    const cursors: (string | null)[] = [];
    const github = recordedGitHub();

    await collectInsight({
      ...github,
      fetchOverviewPage: (after) => {
        cursors.push(after);
        return github.fetchOverviewPage(after);
      },
    });

    expect(cursors).toEqual([null, "MTAw"]);
  });

  it("stops after the page limit", async () => {
    let calls = 0;

    await collectInsight(
      recordedGitHub({
        fetchOverviewPage: async () => {
          calls += 1;
          return pageOne;
        },
      }),
    );

    expect(calls).toBe(MAX_CONTEXT_PAGES);
  });

  it("rejects a response without a pull request", async () => {
    await expect(
      collectInsight(
        recordedGitHub({
          fetchOverviewPage: async () => ({
            data: { repository: { pullRequest: null } },
          }),
        }),
      ),
    ).rejects.toThrow();
  });
});
