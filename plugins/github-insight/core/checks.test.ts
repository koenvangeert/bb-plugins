import { describe, expect, it } from "vitest";
import {
  failingCheckRunIds,
  latestCheckCandidates,
  mapCheckRunStatus,
  mapStatusContextState,
  toCheck,
  type CheckNode,
  type CheckRunNode,
  type StatusContextNode,
} from "./checks";

function checkRun(overrides: Partial<CheckRunNode> = {}): CheckRunNode {
  return {
    __typename: "CheckRun",
    id: "CR_1",
    databaseId: 1,
    name: "build",
    status: "COMPLETED",
    conclusion: "SUCCESS",
    detailsUrl: "https://github.com/o/r/actions/runs/1/job/1",
    startedAt: "2026-09-24T10:00:00Z",
    title: null,
    summary: null,
    ...overrides,
  };
}

function statusContext(
  overrides: Partial<StatusContextNode> = {},
): StatusContextNode {
  return {
    __typename: "StatusContext",
    context: "Storybook Publish",
    state: "SUCCESS",
    description: null,
    targetUrl: "https://example.com/storybook",
    createdAt: "2026-09-24T10:00:00Z",
    ...overrides,
  };
}

describe("mapCheckRunStatus", () => {
  it.each([
    ["FAILURE", "failed"],
    ["TIMED_OUT", "failed"],
    ["ACTION_REQUIRED", "failed"],
    ["STARTUP_FAILURE", "failed"],
    ["CANCELLED", "cancelled"],
    ["STALE", "cancelled"],
    ["SUCCESS", "passed"],
    ["SKIPPED", "skipped"],
    ["NEUTRAL", "skipped"],
  ] as const)("maps completed conclusion %s to %s", (conclusion, expected) => {
    expect(mapCheckRunStatus("COMPLETED", conclusion)).toBe(expected);
  });

  it.each(["QUEUED", "IN_PROGRESS", "WAITING", "PENDING", "REQUESTED"] as const)(
    "maps status %s without a conclusion to running",
    (status) => {
      expect(mapCheckRunStatus(status, null)).toBe("running");
    },
  );
});

describe("mapStatusContextState", () => {
  it.each([
    ["ERROR", "failed"],
    ["FAILURE", "failed"],
    ["PENDING", "running"],
    ["EXPECTED", "running"],
    ["SUCCESS", "passed"],
  ] as const)("maps state %s to %s", (state, expected) => {
    expect(mapStatusContextState(state)).toBe(expected);
  });
});

function buildChecks(nodes: readonly CheckNode[]) {
  return latestCheckCandidates(nodes).map((candidate) =>
    toCheck(candidate, new Map()),
  );
}

describe("latestCheckCandidates", () => {
  it("shows a check re-run after a cancel once, as passed", () => {
    const checks = buildChecks([
      checkRun({
        databaseId: 1,
        name: "renovate-gate",
        conclusion: "CANCELLED",
        startedAt: "2026-09-24T10:00:00Z",
      }),
      checkRun({
        databaseId: 2,
        name: "renovate-gate",
        conclusion: "SUCCESS",
        startedAt: "2026-09-24T10:05:00Z",
        detailsUrl: "https://github.com/o/r/actions/runs/2/job/2",
      }),
    ]);

    expect(checks).toMatchObject([
      {
        name: "renovate-gate",
        status: "passed",
        url: "https://github.com/o/r/actions/runs/2/job/2",
      },
    ]);
  });

  it("breaks a startedAt tie by the higher databaseId", () => {
    const checks = buildChecks([
      checkRun({ databaseId: 9, conclusion: "FAILURE" }),
      checkRun({ databaseId: 3, conclusion: "SUCCESS" }),
    ]);

    expect(checks.map((check) => check.status)).toEqual(["failed"]);
  });

  it("treats a queued re-run without startedAt as the newest run", () => {
    const checks = buildChecks([
      checkRun({ databaseId: 1, conclusion: "FAILURE" }),
      checkRun({
        databaseId: 2,
        status: "QUEUED",
        conclusion: null,
        startedAt: null,
      }),
    ]);

    expect(checks.map((check) => check.status)).toEqual(["running"]);
  });

  it("keeps the newest status context by createdAt", () => {
    const checks = buildChecks([
      statusContext({ state: "SUCCESS", createdAt: "2026-09-24T11:00:00Z" }),
      statusContext({ state: "PENDING", createdAt: "2026-09-24T10:00:00Z" }),
    ]);

    expect(checks).toMatchObject([
      {
        name: "Storybook Publish",
        status: "passed",
        url: "https://example.com/storybook",
      },
    ]);
  });

  it("gives a null url when GitHub has no link", () => {
    const [check] = buildChecks([checkRun({ detailsUrl: null })]);

    expect(check?.url).toBeNull();
  });
});

describe("toCheck", () => {
  it("gives a failed status context its description as reason", () => {
    const [check] = buildChecks([
      statusContext({ state: "ERROR", description: "Storybook build failed" }),
    ]);

    expect(check?.failure).toEqual({
      reason: "Storybook build failed",
      annotations: [],
      annotationCount: 0,
    });
  });

  it("gives a failed check run the annotations of its run", () => {
    const [candidate] = latestCheckCandidates([
      checkRun({ id: "CR_9", conclusion: "FAILURE" }),
    ]);
    const annotation = { path: "src/a.ts", line: 3, message: "boom" };

    const check = toCheck(candidate!, new Map([["CR_9", [annotation]]]));

    expect(check.failure).toEqual({
      reason: "boom",
      annotations: [annotation],
      annotationCount: 1,
    });
  });

  it("keeps the link of a failed check without reason text", () => {
    const [check] = buildChecks([checkRun({ conclusion: "FAILURE" })]);

    expect(check?.failure?.reason).toBe("");
    expect(check?.url).toBe("https://github.com/o/r/actions/runs/1/job/1");
  });

  it("gives no failure detail to a check that did not fail", () => {
    const [check] = buildChecks([checkRun({ conclusion: "SUCCESS" })]);

    expect(check?.failure).toBeNull();
  });
});

describe("failingCheckRunIds", () => {
  it("lists only the failed and cancelled check runs", () => {
    const ids = failingCheckRunIds(
      latestCheckCandidates([
        checkRun({ id: "CR_failed", name: "a", conclusion: "FAILURE" }),
        checkRun({ id: "CR_cancelled", name: "b", conclusion: "CANCELLED" }),
        checkRun({ id: "CR_passed", name: "c", conclusion: "SUCCESS" }),
        statusContext({ state: "FAILURE" }),
      ]),
    );

    expect(ids).toEqual(["CR_failed", "CR_cancelled"]);
  });
});
