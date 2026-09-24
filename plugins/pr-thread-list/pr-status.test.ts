import { describe, expect, it } from "vitest";
import type { PluginSidebarPullRequest } from "@get-bb/plugin-sdk/app";
import { describePullRequest } from "./pr-status";

const pr = (attention: PluginSidebarPullRequest["attention"], state: PluginSidebarPullRequest["state"] = "open"): PluginSidebarPullRequest =>
  ({ number: 42, title: "Ship it", url: "https://example.com/pull/42", state, attention });

describe("pull request labels", () => {
  it.each([
    ["none", "open", "Open", "neutral"],
    ["draft", "draft", "Draft", "neutral"],
    ["checks_pending", "open", "Pending", "waiting"],
    ["checks_failed", "open", "Failed", "problem"],
    ["review_requested", "open", "Review", "waiting"],
    ["changes_requested", "open", "Changes", "problem"],
    ["conflicts", "open", "Conflicts", "problem"],
    ["blocked", "open", "Blocked", "problem"],
    ["ready_to_merge", "open", "Ready", "ready"],
    ["merged", "merged", "Merged", "neutral"],
    ["closed", "closed", "Closed", "neutral"],
  ] as const)("maps %s to a %s PR badge", (attention, state, short, tone) => {
    expect(describePullRequest(pr(attention, state))).toMatchObject({ short, tone,
      label: expect.stringContaining(`PR #42: `) });
  });
  it("uses terminal state over stale attention, and does not invent a ready state", () => {
    expect(describePullRequest(pr("ready_to_merge", "closed")).short).toBe("Closed");
    expect(describePullRequest(pr("future" as PluginSidebarPullRequest["attention"])).short).toBe("Open");
  });
});
