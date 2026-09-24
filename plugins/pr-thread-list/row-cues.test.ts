import { describe, expect, it } from "vitest";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { thread } from "./fixtures";
import { describeActivity, describeIndicator } from "./row-cues";

describe("thread indicator", () => {
  it("keeps the host's attention label and distinguishes runtime/queued state", () => {
    expect(describeIndicator(thread({ indicator: "waiting-for-input", indicatorLabel: "Thread needs user input" })))
      .toBe("Thread needs user input");
    expect(describeIndicator(thread({ indicator: "runtime", runtimeStatus: "active" })))
      .toBe("Thread active");
    expect(describeIndicator(thread({ indicator: "queued-waiting", queuedWork: "waiting" })))
      .toBe("Queued message waiting");
  });
  it("uses a safe fallback for new host indicator kinds", () => {
    expect(describeIndicator(thread({ indicator: "future-kind" as PluginSidebarThread["indicator"] })))
      .toBe("Thread status: idle");
  });
  it("summarizes concurrent background activity", () => {
    expect(describeActivity(thread({ activity: { workflows: 2, backgroundAgents: 1, backgroundCommands: 0, planMode: 0, goals: 0 } })))
      .toBe("2 workflows, 1 background agent");
  });
});
