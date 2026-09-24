import { describe, expect, it } from "vitest";
import {
  buildChecks,
  mapCheckRunStatus,
  mapStatusContextState,
  type CheckRunNode,
  type StatusContextNode,
} from "./checks";

function checkRun(overrides: Partial<CheckRunNode> = {}): CheckRunNode {
  return {
    __typename: "CheckRun",
    databaseId: 1,
    name: "build",
    status: "COMPLETED",
    conclusion: "SUCCESS",
    detailsUrl: "https://github.com/o/r/actions/runs/1/job/1",
    startedAt: "2026-09-24T10:00:00Z",
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

describe("buildChecks", () => {
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

    expect(checks).toEqual([
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

    expect(checks).toEqual([
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
