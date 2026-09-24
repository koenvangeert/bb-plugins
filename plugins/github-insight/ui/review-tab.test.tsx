// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginThreadPanelProps } from "@get-bb/plugin-sdk/app";
import type { FileDiffMetadata } from "@pierre/diffs";
import type { ReviewResult, rpcContract } from "../contract";
import { parsePrFiles } from "../core/pr-files";
import prFiles from "../test/fixtures/pr-1-files.json";

vi.mock("@pierre/diffs/react", () => ({
  FileDiff: ({ fileDiff }: { fileDiff: FileDiffMetadata }) => (
    <pre data-testid="file-diff" data-path={fileDiff.name} data-type={fileDiff.type} />
  ),
}));

class VisibleAtOnce {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal("IntersectionObserver", VisibleAtOnce);
});

const app = await loadPluginApp(() => import("../app"));
const reviewTab = app.threadPanelActions.find((action) => action.id === "review")!;

afterEach(cleanup);

const recorded: ReviewResult = { kind: "ok", files: parsePrFiles(prFiles) };

function renderTab(...results: ReviewResult[]) {
  let call = 0;
  const getReview = () => results[Math.min(call++, results.length - 1)]!;
  return renderSlot<PluginThreadPanelProps, typeof rpcContract>(
    reviewTab,
    { threadId: "thr_1", params: null },
    {
      rpc: {
        getReview,
        getInsight: () => ({ kind: "no_pr" }),
        refresh: () => ({ kind: "no_pr" }),
      },
    },
  );
}

describe("Review tab", () => {
  it("registers as the flush Review thread panel action", () => {
    expect(reviewTab).toMatchObject({ title: "Review", layout: "flush" });
  });

  it("asks for the review of its own thread", async () => {
    const slot = renderTab({ kind: "no_pr" });

    await slot.findByText("No pull request for this thread");
    expect(slot.inspection.rpcCalls).toEqual([
      expect.objectContaining({ method: "getReview", input: { threadId: "thr_1" } }),
    ]);
  });

  it("shows a diff for each file with a patch, in GitHub's order", async () => {
    const slot = renderTab(recorded);

    await slot.findAllByTestId("file-diff");
    expect(
      slot.getAllByTestId("file-diff").map((diff) => diff.getAttribute("data-path")),
    ).toEqual(["plugins/github-insight/app.tsx", "plugins/github-insight/core/pr-ref.ts"]);
    expect(slot.getAllByTestId("file-diff")[0]!.getAttribute("data-type")).toBe("new");
  });

  it("shows the path and 'Diff not available' for a file without a patch", async () => {
    const slot = renderTab(recorded);

    const row = (await slot.findByText("plugins/github-insight/package-lock.json")).closest(
      "section",
    )!;
    expect(within(row).getByText("Diff not available")).toBeTruthy();
  });

  it("says how many files changed", async () => {
    const slot = renderTab(recorded);

    expect(await slot.findByText("3 files changed")).toBeTruthy();
  });

  it("shows the gh error with a retry that loads again", async () => {
    const slot = renderTab({ kind: "error", message: "gh not logged in" }, recorded);

    const alert = await slot.findByRole("alert");
    expect(within(alert).getByText("gh not logged in")).toBeTruthy();
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));

    await slot.findByText("3 files changed");
    expect(slot.inspection.rpcCalls.map((call) => call.method)).toEqual([
      "getReview",
      "getReview",
    ]);
  });

  it("loads again on refresh and shows the new files", async () => {
    const slot = renderTab(recorded, { kind: "ok", files: recorded.files.slice(0, 1) });

    await slot.findByText("3 files changed");
    fireEvent.click(slot.getByRole("button", { name: "Refresh" }));

    expect(await slot.findByText("1 file changed")).toBeTruthy();
  });

  it("shows the diff of a file that gets its patch on refresh", async () => {
    const withoutPatch = recorded.files.map((file) => ({ ...file, patch: null }));
    const slot = renderTab({ kind: "ok", files: withoutPatch }, recorded);

    await slot.findAllByText("Diff not available");
    fireEvent.click(slot.getByRole("button", { name: "Refresh" }));

    expect(await slot.findAllByTestId("file-diff")).toHaveLength(2);
  });
});
