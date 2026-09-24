import { describe, expect, it } from "vitest";
import { buildBlockers, type BlockerInput } from "./blockers";
import type { CheckStatus } from "./checks";

function input(overrides: Partial<BlockerInput> = {}): BlockerInput {
  return {
    prState: "open",
    mergeable: "MERGEABLE",
    mergeStateStatus: "BLOCKED",
    reviewDecision: null,
    unresolvedThreads: 0,
    checkStatuses: [],
    ...overrides,
  };
}

function codes(overrides: Partial<BlockerInput>) {
  return buildBlockers(input(overrides)).map((blocker) => blocker.code);
}

const checkStatuses: CheckStatus[] = ["failed", "failed", "running", "passed"];

describe("buildBlockers", () => {
  it("gives review_required without blocked when a review is required", () => {
    expect(codes({ reviewDecision: "REVIEW_REQUIRED" })).toEqual([
      "review_required",
    ]);
  });

  it("gives behind when the branch is out of date", () => {
    expect(buildBlockers(input({ mergeStateStatus: "BEHIND" }))).toEqual([
      { code: "behind", text: "Branch out of date" },
    ]);
  });

  it("gives an empty list for a PR that is ready to merge", () => {
    expect(codes({ mergeStateStatus: "CLEAN", unresolvedThreads: 2 })).toEqual([]);
  });

  it("gives an empty list for a merged or closed PR", () => {
    expect(codes({ prState: "merged", mergeStateStatus: "DIRTY" })).toEqual([]);
    expect(codes({ prState: "closed", mergeStateStatus: "DIRTY" })).toEqual([]);
  });

  it("gives blocked only when no other code explains it", () => {
    expect(buildBlockers(input())).toEqual([
      { code: "blocked", text: "Blocked by branch rules" },
    ]);
  });

  it("does not give blocked when GitHub is still computing the merge state", () => {
    expect(codes({ mergeStateStatus: "UNKNOWN" })).toEqual([]);
  });

  it("orders all codes from most to least important", () => {
    expect(
      codes({
        prState: "draft",
        mergeable: "CONFLICTING",
        mergeStateStatus: "BEHIND",
        reviewDecision: "CHANGES_REQUESTED",
        unresolvedThreads: 3,
        checkStatuses,
      }),
    ).toEqual([
      "conflicts",
      "checks_failed",
      "changes_requested",
      "behind",
      "unresolved_threads",
      "checks_running",
      "draft",
    ]);
    expect(
      codes({ reviewDecision: "REVIEW_REQUIRED", unresolvedThreads: 1, checkStatuses }),
    ).toEqual(["checks_failed", "review_required", "unresolved_threads", "checks_running"]);
  });

  it("counts failed checks, running checks, and unresolved threads in the text", () => {
    expect(
      buildBlockers(input({ unresolvedThreads: 1, checkStatuses })).map(
        (blocker) => blocker.text,
      ),
    ).toEqual(["2 checks failed", "1 unresolved thread", "1 check running"]);
  });

  it("gives conflicts when GitHub reports the merge state as dirty", () => {
    expect(codes({ mergeable: "UNKNOWN", mergeStateStatus: "DIRTY" })).toEqual([
      "conflicts",
    ]);
  });
});
