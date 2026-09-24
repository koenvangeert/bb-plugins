// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginThreadPanelProps } from "@get-bb/plugin-sdk/app";
import type { ReactNode } from "react";
import type { DiffLineAnnotation, FileDiffMetadata } from "@pierre/diffs";
import type { ReviewResult, rpcContract } from "../contract";
import { parsePrFiles } from "../core/pr-files";
import { parseReviewThreads } from "../core/review-threads";
import { placeThreads, type ThreadPlacement } from "../core/thread-placement";
import prFiles from "../test/fixtures/pr-1-files.json";
import threadedPrFiles from "../test/fixtures/pr-25259-files.json";
import reviewThreads from "../test/fixtures/pr-25259-review-threads.json";

vi.mock("@pierre/diffs/react", () => ({
  FileDiff: ({
    fileDiff,
    lineAnnotations = [],
    renderAnnotation,
  }: {
    fileDiff: FileDiffMetadata;
    lineAnnotations?: DiffLineAnnotation<unknown>[];
    renderAnnotation?: (annotation: DiffLineAnnotation<unknown>) => ReactNode;
  }) => (
    <div data-testid="file-diff" data-path={fileDiff.name} data-type={fileDiff.type}>
      {lineAnnotations.map((annotation, index) => (
        <div
          key={index}
          data-testid="line-annotation"
          data-side={annotation.side}
          data-line={annotation.lineNumber}
        >
          {renderAnnotation?.(annotation)}
        </div>
      ))}
    </div>
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

const noThreads: ThreadPlacement = { placed: [], outdated: [] };
const recorded: ReviewResult = { kind: "ok", files: parsePrFiles(prFiles), threads: noThreads };

const threadedFiles = parsePrFiles(threadedPrFiles);
const threaded = {
  kind: "ok",
  files: threadedFiles,
  threads: placeThreads(threadedFiles, parseReviewThreads([reviewThreads])),
} satisfies ReviewResult;

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
    const slot = renderTab(recorded, { ...recorded, files: recorded.files.slice(0, 1) });

    await slot.findByText("3 files changed");
    fireEvent.click(slot.getByRole("button", { name: "Refresh" }));

    expect(await slot.findByText("1 file changed")).toBeTruthy();
  });

  it("shows the diff of a file that gets its patch on refresh", async () => {
    const withoutPatch = recorded.files.map((file) => ({ ...file, patch: null }));
    const slot = renderTab({ ...recorded, files: withoutPatch }, recorded);

    await slot.findAllByText("Diff not available");
    fireEvent.click(slot.getByRole("button", { name: "Refresh" }));

    expect(await slot.findAllByTestId("file-diff")).toHaveLength(2);
  });
});

describe("Review tab threads", () => {
  const OPEN_THREAD = "There's no wait for the new row to mount";
  const REPLY = "Agreed, removed.";
  const RESOLVED_REPLY = "False positive.";

  function annotationWith(slot: ReturnType<typeof renderTab>, text: string) {
    return slot
      .getAllByTestId("line-annotation")
      .find((annotation) => annotation.textContent?.includes(text));
  }

  function withResolved(threadId: string): ReviewResult {
    const resolve = <T extends { id: string; resolved: boolean }>(thread: T) =>
      thread.id === threadId ? { ...thread, resolved: true } : thread;
    return {
      ...threaded,
      threads: {
        placed: threaded.threads.placed.map((placed) => ({ ...placed, thread: resolve(placed.thread) })),
        outdated: threaded.threads.outdated.map(resolve),
      },
    };
  }

  it("shows a thread below its line on the new side of its file", async () => {
    const slot = renderTab(threaded);

    await slot.findAllByTestId("line-annotation");
    const annotation = annotationWith(slot, OPEN_THREAD)!;
    expect(annotation.dataset).toMatchObject({ side: "additions", line: "46" });
    expect(annotation.closest("[data-testid=file-diff]")!.getAttribute("data-path")).toBe(
      "apps/shell/e2e/catalog/integrations/components/asset/generic-configuration/createDatabricksOutboundSyncConfigurationComponent.ts",
    );
  });

  it("shows each comment with its author, time, and Markdown body, in order", async () => {
    const slot = renderTab(threaded);

    await slot.findAllByTestId("line-annotation");
    const thread = within(annotationWith(slot, OPEN_THREAD)!);
    const bodies = thread.getAllByTestId("bb-markdown").map((body) => body.textContent);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatch(/^There's no wait/);
    expect(thread.getByText("a-bandziuk")).toBeTruthy();
    expect(thread.getByText("RuslanPleskunCollibra")).toBeTruthy();
    expect(
      thread.getAllByRole("time").map((time) => time.getAttribute("datetime")),
    ).toEqual(["2026-09-18T14:34:40.000Z", "2026-09-18T15:17:49.000Z"]);
  });

  it("shows an outdated thread at the top with its path, original line, and snippet", async () => {
    const slot = renderTab(threaded);

    const section = within(await slot.findByRole("region", { name: "Outdated" }));
    expect(
      section.getByText("apps/shell/e2e/catalog/integrations/components/helpers/clickWithScrollHelper.ts"),
    ).toBeTruthy();
    expect(section.getByText("Line 32")).toBeTruthy();
    const snippet = section.getByTestId("bb-diff");
    expect(snippet.textContent).toMatch(/^@@ -10,22 \+14,31 @@/);
    expect(snippet.getAttribute("data-path")).toBe(
      "apps/shell/e2e/catalog/integrations/components/helpers/clickWithScrollHelper.ts",
    );
    expect(section.getByText(REPLY, { exact: false })).toBeTruthy();
  });

  it("hides resolved threads", async () => {
    const slot = renderTab(withResolved("PRRT_kwDOHI7l-86jxula"));

    await slot.findAllByTestId("line-annotation");
    expect(annotationWith(slot, OPEN_THREAD)).toBeUndefined();
    expect(slot.queryByText(RESOLVED_REPLY, { exact: false })).toBeNull();
  });

  it("shows resolved threads collapsed when 'Show resolved' is on, and expands one", async () => {
    const slot = renderTab(withResolved("PRRT_kwDOHI7l-86jxula"));

    fireEvent.click(await slot.findByRole("checkbox", { name: "Show resolved" }));

    const collapsed = annotationWith(slot, "Resolved")!;
    expect(collapsed.dataset).toMatchObject({ side: "additions", line: "46" });
    expect(within(collapsed).queryByTestId("bb-markdown")).toBeNull();
    const toggle = within(collapsed).getByRole("button", { name: /a-bandziuk.*Resolved/ });
    fireEvent.click(toggle);
    expect(within(collapsed).getAllByTestId("bb-markdown")).toHaveLength(2);

    const outdated = within(slot.getByRole("region", { name: "Outdated" }));
    expect(outdated.getByRole("button", { name: /wiz-22f56a2082.*Resolved/ })).toBeTruthy();
  });

  it("counts open threads and outdated open threads", async () => {
    const slot = renderTab(threaded);

    expect(await slot.findByText("3 open")).toBeTruthy();
    expect(slot.getByText("1 outdated")).toBeTruthy();
  });

  it("leaves resolved threads out of the counts", async () => {
    const slot = renderTab(withResolved("PRRT_kwDOHI7l-86jx0SN"));

    expect(await slot.findByText("2 open")).toBeTruthy();
    expect(slot.getByText("0 outdated")).toBeTruthy();
  });

  it("links to GitHub when a thread has more comments than were loaded", async () => {
    const [first, ...rest] = threaded.threads.placed;
    const slot = renderTab({
      ...threaded,
      threads: { ...threaded.threads, placed: [{ ...first!, thread: { ...first!.thread, hasMoreComments: true } }, ...rest] },
    });

    const link = await slot.findByRole("link", { name: "More comments on GitHub" });
    expect(link.getAttribute("href")).toBe(first!.thread.comments.at(-1)!.url);
  });

  it("has no Outdated section when no outdated thread shows", async () => {
    const slot = renderTab(withResolved("PRRT_kwDOHI7l-86jx0SN"));

    await slot.findByText("2 open");
    expect(slot.queryByRole("region", { name: "Outdated" })).toBeNull();
  });
});
