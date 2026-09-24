import { describe, expect, it } from "vitest";
import pageOne from "../test/fixtures/pr-25337-overview-page-1.json";
import pageTwo from "../test/fixtures/pr-25337-overview-page-2.json";
import { MAX_CONTEXT_PAGES, collectOverview } from "./overview";

const recordedPages: Record<string, unknown> = { start: pageOne, MTAw: pageTwo };

function fetchRecorded(after: string | null): Promise<unknown> {
  return Promise.resolve(recordedPages[after ?? "start"]);
}

describe("collectOverview on PR 25337", () => {
  it("gives the PR header", async () => {
    const insight = await collectOverview(fetchRecorded);

    expect(insight.pr).toEqual({
      number: 25337,
      title:
        "feat(*): add ootbDomainTypesIds constants and replace hardcoded domain type UUIDs",
      state: "open",
      url: "https://github.com/collibra/frontend/pull/25337",
    });
  });

  it("gives one check per name across both pages", async () => {
    const insight = await collectOverview(fetchRecorded);
    const names = insight.checks.map((check) => check.name);

    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("Storybook Publish");
  });

  it("shows re-runs after a cancel as passed", async () => {
    const insight = await collectOverview(fetchRecorded);
    const build = insight.checks.find(
      (check) => check.name === "trigger-testing / build / build",
    );

    expect(build?.status).toBe("passed");
  });

  it("counts the newest run of every check by status", async () => {
    const insight = await collectOverview(fetchRecorded);
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
});

describe("collectOverview paging", () => {
  it("follows the contexts cursor to the last page", async () => {
    const cursors: (string | null)[] = [];

    await collectOverview((after) => {
      cursors.push(after);
      return fetchRecorded(after);
    });

    expect(cursors).toEqual([null, "MTAw"]);
  });

  it("stops after the page limit", async () => {
    let calls = 0;

    await collectOverview(async () => {
      calls += 1;
      return pageOne;
    });

    expect(calls).toBe(MAX_CONTEXT_PAGES);
  });

  it("rejects a response without a pull request", async () => {
    await expect(
      collectOverview(async () => ({
        data: { repository: { pullRequest: null } },
      })),
    ).rejects.toThrow();
  });
});
