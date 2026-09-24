// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginThreadPanelProps } from "@get-bb/plugin-sdk/app";
import type { InsightResult, rpcContract } from "./contract";
import type { Check } from "./core/checks";
import type { PrInsight } from "./core/overview";

const app = await loadPluginApp(() => import("./app"));
const prTab = app.threadPanelActions.find((action) => action.id === "pr")!;

afterEach(cleanup);

function check(
  name: string,
  status: Check["status"],
  failure: Check["failure"] = null,
): Check {
  return { name, status, url: `https://github.com/o/r/runs/${name}`, failure };
}

const pr = {
  number: 25337,
  title: "feat(*): add ootbDomainTypesIds constants",
  state: "open",
  url: "https://github.com/collibra/frontend/pull/25337",
} as const;

const emptyInsight: PrInsight = { pr, blockers: [], reviewers: [], checks: [] };

const insight: InsightResult = {
  kind: "ok",
  insight: {
    pr,
    blockers: [
      { code: "checks_failed", text: "1 check failed" },
      { code: "review_required", text: "Review required" },
    ],
    reviewers: [
      { name: "ai-governance", kind: "team", state: "pending", codeOwner: true },
      { name: "alice", kind: "user", state: "approved", codeOwner: false },
    ],
    checks: [
      check("lint", "passed"),
      check("a11y-test", "failed", {
        reason: "Process completed with exit code 1.",
        annotations: [
          { path: ".github", line: 4092, message: "Process completed with exit code 1." },
        ],
        annotationCount: 1,
      }),
      check("e2e", "cancelled", { reason: "", annotations: [], annotationCount: 0 }),
      check("build", "running"),
      check("container", "skipped"),
      check("typecheck", "passed"),
    ],
  },
};

function renderTab(result: InsightResult) {
  return renderSlot<PluginThreadPanelProps, typeof rpcContract>(
    prTab,
    { threadId: "thr_1", params: null },
    { rpc: { getInsight: () => result } },
  );
}

describe("PR tab", () => {
  it("registers as the PR thread panel action", () => {
    expect(prTab).toMatchObject({ title: "PR", layout: "padded" });
  });

  it("asks for the insight of its own thread", async () => {
    const slot = renderTab({ kind: "no_pr" });

    await slot.findByText("No pull request for this thread");
    expect(slot.inspection.rpcCalls).toEqual([
      expect.objectContaining({
        method: "getInsight",
        input: { threadId: "thr_1" },
      }),
    ]);
  });

  it("shows the PR number, title, state, and link", async () => {
    const slot = renderTab(insight);

    await slot.findByText("feat(*): add ootbDomainTypesIds constants");
    expect(slot.getByText("#25337")).toBeTruthy();
    expect(slot.getByText("Open")).toBeTruthy();
    expect(
      slot.getByRole("link", { name: /open on github/i }).getAttribute("href"),
    ).toBe("https://github.com/collibra/frontend/pull/25337");
  });

  it("shows the header, the blockers, the reviewers, and the checks in this order", async () => {
    const slot = renderTab(insight);

    await slot.findByText("#25337");
    const sections = slot
      .getAllByRole("region")
      .map((section) => section.getAttribute("aria-label"));
    expect(sections).toEqual(["Merge blockers", "Reviewers", "Checks"]);
  });

  it("lists the merge blockers in order", async () => {
    const slot = renderTab(insight);

    const blockers = await slot.findByRole("region", { name: "Merge blockers" });
    expect(
      within(blockers)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["1 check failed", "Review required"]);
  });

  it("shows a pending code owner team with its labels", async () => {
    const slot = renderTab(insight);

    const row = (await slot.findByText("ai-governance (team)")).closest("li")!;
    expect(within(row).getByText("Pending")).toBeTruthy();
    expect(within(row).getByText("code owner")).toBeTruthy();
  });

  it("shows an approved user without the code owner label", async () => {
    const slot = renderTab(insight);

    const row = (await slot.findByText("alice")).closest("li")!;
    expect(within(row).getByText("Approved")).toBeTruthy();
    expect(within(row).queryByText("code owner")).toBeNull();
  });

  it("leaves out the blockers and reviewers of a PR without them", async () => {
    const slot = renderTab({
      kind: "ok",
      insight: { ...emptyInsight, checks: [check("lint", "passed")] },
    });

    await slot.findByText("#25337");
    expect(slot.queryByRole("region", { name: "Merge blockers" })).toBeNull();
    expect(slot.queryByRole("region", { name: "Reviewers" })).toBeNull();
  });

  it("groups checks by status in order failed, cancelled, running, passed, skipped", async () => {
    const slot = renderTab(insight);

    await slot.findByText("#25337");
    const headings = slot
      .getAllByTestId("check-group-heading")
      .map((heading) => heading.textContent);
    expect(headings).toEqual([
      "1 failed",
      "1 cancelled",
      "1 running",
      "2 passed",
      "1 skipped",
    ]);
  });

  it("links each check to GitHub", async () => {
    const slot = renderTab(insight);

    const link = await slot.findByRole("link", { name: "a11y-test" });
    expect(link.getAttribute("href")).toBe(
      "https://github.com/o/r/runs/a11y-test",
    );
  });

  it("collapses passed and skipped checks until the user expands them", async () => {
    const slot = renderTab(insight);

    const passed = (await slot.findByText("2 passed")).closest("details")!;
    const skipped = slot.getByText("1 skipped").closest("details")!;
    expect(passed.open).toBe(false);
    expect(skipped.open).toBe(false);

    fireEvent.click(within(passed).getByText("2 passed"));
    expect(passed.open).toBe(true);
    expect(within(passed).getByText("lint")).toBeTruthy();
  });

  it("shows the reason and annotations of a failed check", async () => {
    const slot = renderTab(insight);

    const row = (await slot.findByRole("link", { name: "a11y-test" })).closest("li")!;
    expect(within(row).getByTestId("check-reason").textContent).toBe(
      "Process completed with exit code 1.",
    );
    expect(within(row).getByText(".github:4092")).toBeTruthy();
  });

  it("keeps the link of a cancelled check without reason text", async () => {
    const slot = renderTab(insight);

    const row = (await slot.findByRole("link", { name: "e2e" })).closest("li")!;
    expect(within(row).queryByTestId("check-reason")).toBeNull();
  });

  it("says how many more annotations there are", async () => {
    const annotations = Array.from({ length: 5 }, (_, index) => ({
      path: "src/app.ts",
      line: index + 1,
      message: `error ${index + 1}`,
    }));
    const slot = renderTab({
      kind: "ok",
      insight: {
        ...emptyInsight,
        checks: [
          check("lint", "failed", {
            reason: "error 1",
            annotations,
            annotationCount: 12,
          }),
        ],
      },
    });

    await slot.findByText("7 more");
    expect(slot.getAllByTestId("check-annotation")).toHaveLength(5);
  });

  it("shows the error text when the insight cannot be read", async () => {
    const slot = renderTab({ kind: "error", message: "gh auth login" });

    expect(await slot.findByRole("alert")).toHaveProperty(
      "textContent",
      "gh auth login",
    );
  });

  it("says so when the PR has no checks", async () => {
    const slot = renderTab({ kind: "ok", insight: emptyInsight });

    await slot.findByText("No checks on the head commit");
  });
});
