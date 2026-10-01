// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginThreadPanelProps } from "@get-bb/plugin-sdk/app";
import type { ReactNode } from "react";
import type { DiffLineAnnotation, FileDiffMetadata } from "@pierre/diffs";
import type { ReviewResult, rpcContract, SendToAgentResult } from "../contract";
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
const recorded: ReviewResult = { kind: "ok", files: parsePrFiles(prFiles), threads: noThreads, drafts: {} };

const threadedFiles = parsePrFiles(threadedPrFiles);
const threaded = {
  kind: "ok",
  files: threadedFiles,
  threads: placeThreads(threadedFiles, parseReviewThreads([reviewThreads])),
  drafts: {},
} satisfies ReviewResult;

function renderTab(...results: ReviewResult[]) {
  return renderTabSending(() => ({ kind: "sent", delivery: "sent", threadCount: 1 }), ...results);
}

function renderTabSending(sendToAgent: () => SendToAgentResult | Promise<SendToAgentResult>, ...results: ReviewResult[]) {
  let call = 0;
  const getReview = () => results[Math.min(call++, results.length - 1)]!;
  return renderSlot<PluginThreadPanelProps, typeof rpcContract>(
    reviewTab,
    { threadId: "thr_1", params: null },
    {
      rpc: {
        getReview,
        sendToAgent,
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

describe("Review tab drafts", () => {
  const PLACED = "PRRT_kwDOHI7l-86jxula";
  const OUTDATED = "PRRT_kwDOHI7l-86jx0SN";
  const draft = { body: "Renamed in abc123", updatedAt: 1, source: "agent" as const };

  function withDraft(reviewThreadId: string): ReviewResult {
    return { ...threaded, drafts: { [reviewThreadId]: draft } };
  }

  it("shows a draft below the comments of its thread as 'Draft from agent'", async () => {
    const slot = renderTab(withDraft(PLACED));

    const section = await slot.findByRole("region", { name: "Draft from agent" });
    expect(section.textContent).toContain("Renamed in abc123");
    const card = section.closest("article")!;
    expect(card.textContent).toContain("There's no wait for the new row to mount");
    expect(card.lastElementChild).toBe(section);
  });

  it("shows the draft of an outdated thread", async () => {
    const slot = renderTab(withDraft(OUTDATED));

    const outdated = within(await slot.findByRole("region", { name: "Outdated" }));
    expect(outdated.getByRole("region", { name: "Draft from agent" }).textContent).toContain(
      "Renamed in abc123",
    );
  });

  it("shows the draft text as written, not as Markdown", async () => {
    const slot = renderTab({ ...threaded, drafts: { [PLACED]: { ...draft, body: "**bold**\nnext" } } });

    const section = await slot.findByRole("region", { name: "Draft from agent" });
    expect(within(section).queryByTestId("bb-markdown")).toBeNull();
    expect(section.textContent).toContain("**bold**\nnext");
  });

  it("shows a draft saved while the tab is open", async () => {
    const slot = renderTab(threaded, withDraft(PLACED));
    await slot.findByText("3 open");

    await slot.behavior.emitRealtime("review.updated", { threadId: "thr_1" });

    const section = await slot.findByRole("region", { name: "Draft from agent" });
    expect(section.textContent).toContain("Renamed in abc123");
  });

  it("ignores a review update of another thread", async () => {
    const slot = renderTab(threaded, withDraft(PLACED));
    await slot.findByText("3 open");

    await slot.behavior.emitRealtime("review.updated", { threadId: "thr_2" });

    expect(slot.inspection.rpcCalls.map((call) => call.method)).toEqual(["getReview"]);
  });
});

describe("Review tab send to agent", () => {
  const PLACED = "PRRT_kwDOHI7l-86jxula";
  const OUTDATED = "PRRT_kwDOHI7l-86jx0SN";
  const PLACED_TEXT = "There's no wait for the new row to mount";

  function checkboxOf(slot: ReturnType<typeof renderTab>, text: string) {
    const card = slot.getAllByRole("article").find((article) => article.textContent?.includes(text))!;
    return within(card).getByRole("checkbox", { name: "Select for agent" }) as HTMLInputElement;
  }

  function outdatedCheckbox(slot: ReturnType<typeof renderTab>) {
    return within(slot.getByRole("region", { name: "Outdated" })).getByRole("checkbox", {
      name: "Select for agent",
    }) as HTMLInputElement;
  }

  async function selectTwo(slot: ReturnType<typeof renderTab>) {
    await slot.findAllByTestId("line-annotation");
    fireEvent.click(checkboxOf(slot, PLACED_TEXT));
    fireEvent.click(outdatedCheckbox(slot));
  }

  function sendCalls(slot: ReturnType<typeof renderTab>) {
    return slot.inspection.rpcCalls.filter((call) => call.method === "sendToAgent");
  }

  it("has a checkbox on each open thread and a disabled 'Send 0 to agent'", async () => {
    const slot = renderTab(threaded);

    await slot.findAllByTestId("line-annotation");
    expect(slot.getAllByRole("checkbox", { name: "Select for agent" })).toHaveLength(3);
    expect((slot.getByRole("button", { name: "Send 0 to agent" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("counts the selected threads", async () => {
    const slot = renderTab(threaded);

    await selectTwo(slot);
    expect((slot.getByRole("button", { name: "Send 2 to agent" }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(outdatedCheckbox(slot));
    expect(slot.getByRole("button", { name: "Send 1 to agent" })).toBeTruthy();
  });

  it("has no checkbox on a resolved thread", async () => {
    const slot = renderTab(threaded);

    fireEvent.click(await slot.findByRole("checkbox", { name: "Show resolved" }));
    const resolved = within(slot.getByRole("region", { name: "Outdated" })).getByRole("button", {
      name: /wiz-22f56a2082.*Resolved/,
    });
    fireEvent.click(resolved);

    expect(within(resolved.closest("article")!).queryByRole("checkbox")).toBeNull();
    expect(slot.getAllByRole("checkbox", { name: "Select for agent" })).toHaveLength(3);
  });

  it("sends the selected threads of its own thread, then clears the selection", async () => {
    const slot = renderTabSending(() => ({ kind: "sent", delivery: "sent", threadCount: 2 }), threaded);
    await selectTwo(slot);

    fireEvent.click(slot.getByRole("button", { name: "Send 2 to agent" }));

    expect(await slot.findByRole("button", { name: "Send 0 to agent" })).toBeTruthy();
    expect(sendCalls(slot)).toEqual([
      expect.objectContaining({ input: { threadId: "thr_1", reviewThreadIds: [PLACED, OUTDATED] } }),
    ]);
    expect(checkboxOf(slot, PLACED_TEXT).checked).toBe(false);
    expect(slot.getByText("Sent to agent")).toBeTruthy();
  });

  it("says when the message waits for a busy agent", async () => {
    const slot = renderTabSending(() => ({ kind: "sent", delivery: "queued", threadCount: 2 }), threaded);
    await selectTwo(slot);

    fireEvent.click(slot.getByRole("button", { name: "Send 2 to agent" }));

    expect(await slot.findByText("Queued until the agent is idle")).toBeTruthy();
  });

  it("says how many threads were sent when some got resolved in the meantime", async () => {
    const slot = renderTabSending(() => ({ kind: "sent", delivery: "sent", threadCount: 1 }), threaded);
    await selectTwo(slot);

    fireEvent.click(slot.getByRole("button", { name: "Send 2 to agent" }));

    expect(await slot.findByText("Sent 1 of 2 to agent")).toBeTruthy();
  });

  it("keeps a thread selected during the send, which was not sent", async () => {
    let finish: (result: SendToAgentResult) => void = () => {};
    const slot = renderTabSending(() => new Promise((resolve) => (finish = resolve)), threaded);
    await slot.findAllByTestId("line-annotation");
    fireEvent.click(checkboxOf(slot, PLACED_TEXT));

    fireEvent.click(slot.getByRole("button", { name: "Send 1 to agent" }));
    fireEvent.click(outdatedCheckbox(slot));
    await act(async () => finish({ kind: "sent", delivery: "sent", threadCount: 1 }));

    expect(outdatedCheckbox(slot).checked).toBe(true);
    expect(checkboxOf(slot, PLACED_TEXT).checked).toBe(false);
  });

  it("shows the error and keeps the selection when the send fails", async () => {
    const slot = renderTabSending(() => ({ kind: "error", message: "gh not logged in" }), threaded);
    await selectTwo(slot);

    fireEvent.click(slot.getByRole("button", { name: "Send 2 to agent" }));

    const alert = await slot.findByRole("alert");
    expect(alert.textContent).toContain("gh not logged in");
    expect(slot.getByRole("button", { name: "Send 2 to agent" })).toBeTruthy();
    expect(checkboxOf(slot, PLACED_TEXT).checked).toBe(true);
  });

  it("shows the error and keeps the selection when the call throws", async () => {
    const slot = renderTabSending(() => {
      throw new Error("Thread is archived");
    }, threaded);
    await selectTwo(slot);

    fireEvent.click(slot.getByRole("button", { name: "Send 2 to agent" }));

    expect((await slot.findByRole("alert")).textContent).toContain("Thread is archived");
    expect(slot.getByRole("button", { name: "Send 2 to agent" })).toBeTruthy();
  });

  it("stops counting a selected thread that got resolved", async () => {
    const resolved = {
      ...threaded,
      threads: {
        ...threaded.threads,
        outdated: threaded.threads.outdated.map((thread) => ({ ...thread, resolved: true })),
      },
    };
    const slot = renderTab(threaded, resolved);
    await selectTwo(slot);

    await slot.behavior.emitRealtime("review.updated", { threadId: "thr_1" });

    expect(await slot.findByRole("button", { name: "Send 1 to agent" })).toBeTruthy();
  });
});
