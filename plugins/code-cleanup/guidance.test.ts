import { describe, expect, it } from "vitest";
import { defaultGuidance } from "./guidance";

describe("default Code Cleanup guidance", () => {
  it("asks the agent to judge substantial adjacent work, check duplicates, and stay on task", () => {
    const text = defaultGuidance("proj_example");
    expect(text).toMatch(/substantial.*actionable/i);
    expect(text).toMatch(/edited files|adjacent code/i);
    expect(text).toMatch(/stay focused|current task/i);
    expect(text).toMatch(/minor.*style|style.*nit/i);
    expect(text).toContain('bb task-board list --project proj_example --query');
    expect(text).toContain('bb task-board add --project proj_example --prompt');
    expect(text).toMatch(/existing|duplicate/i);
    expect(text).toMatch(/unavailable.*report|report.*unavailable/is);
    expect(text).not.toMatch(/\bopenforge\b|--worktree|--depends-on|--label/i);
    expect(text).not.toMatch(/automatically create|always create/i);
    expect(text.length).toBeLessThanOrEqual(4096);
  });
});
