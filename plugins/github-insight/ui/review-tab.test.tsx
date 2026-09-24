// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginThreadPanelProps } from "@get-bb/plugin-sdk/app";
import type { ReactNode } from "react";
import type { DiffLineAnnotation, FileDiffMetadata } from "@pierre/diffs";
import type { ReplyResult, ReviewResult, rpcContract, SetResolvedResult } from "../contract";
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

interface WriteHandlers {
  reply?: () => ReplyResult | Promise<ReplyResult>;
  setResolved?: () => SetResolvedResult | Promise<SetResolvedResult>;
}

function renderTab(...results: ReviewResult[]) {
  return renderTabWith({}, ...results);
}

function renderTabWith(writes: WriteHandlers, ...results: ReviewResult[]) {
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
        reply: writes.reply ?? (() => ({ kind: "posted", pendingReviewUrl: null, resolveError: null })),
        setResolved: writes.setResolved ?? (() => ({ kind: "ok" })),
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
    const lastComment = within(card).getAllByTestId("bb-markdown").at(-1)!;
    expect(lastComment.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

describe("Review tab thread actions", () => {
  const PLACED = "PRRT_kwDOHI7l-86jxula";
  const OPEN_THREAD = "There's no wait for the new row to mount";
  const REPLY = 'Fixed in "abc123"\nThanks';

  async function openCard(slot: ReturnType<typeof renderTab>) {
    await slot.findAllByTestId("line-annotation");
    const annotation = slot
      .getAllByTestId("line-annotation")
      .find((candidate) => candidate.textContent?.includes(OPEN_THREAD))!;
    return within(annotation.querySelector("article")!);
  }

  function typeReply(card: Awaited<ReturnType<typeof openCard>>, text = REPLY) {
    fireEvent.change(card.getByRole("textbox", { name: "Reply" }), { target: { value: text } });
  }

  function writeCalls(slot: ReturnType<typeof renderTab>) {
    return slot.inspection.rpcCalls.filter((call) => call.method !== "getReview");
  }

  function resolvedPlaced(): ReviewResult {
    return {
      ...threaded,
      threads: {
        ...threaded.threads,
        placed: threaded.threads.placed.map((placed) =>
          placed.thread.id === PLACED ? { ...placed, thread: { ...placed.thread, resolved: true } } : placed,
        ),
      },
    };
  }

  it("does not post an empty reply", async () => {
    const card = await openCard(renderTab(threaded));

    expect(card.getByRole("button", { name: "Post" }).hasAttribute("disabled")).toBe(true);
    typeReply(card, "   ");
    expect(card.getByRole("button", { name: "Post + resolve" }).hasAttribute("disabled")).toBe(true);
  });

  it("posts the reply, clears the box, and loads the thread again", async () => {
    const slot = renderTab(threaded);
    const card = await openCard(slot);

    typeReply(card);
    fireEvent.click(card.getByRole("button", { name: "Post" }));

    await waitFor(() => expect(slot.inspection.rpcCalls.map((call) => call.method)).toEqual(["getReview", "reply", "getReview"]));
    expect(writeCalls(slot)[0]!.input).toEqual({ threadId: "thr_1", reviewThreadId: PLACED, body: REPLY, resolve: false });
    expect((card.getByRole("textbox", { name: "Reply" }) as HTMLTextAreaElement).value).toBe("");
  });

  it("asks to post and resolve on 'Post + resolve'", async () => {
    const slot = renderTab(threaded);
    const card = await openCard(slot);

    typeReply(card);
    fireEvent.click(card.getByRole("button", { name: "Post + resolve" }));

    await waitFor(() => expect(writeCalls(slot)).toHaveLength(1));
    expect(writeCalls(slot)[0]!.input).toMatchObject({ reviewThreadId: PLACED, resolve: true });
  });

  it("shows the error and keeps the text when the post fails", async () => {
    const slot = renderTabWith({ reply: () => ({ kind: "post_failed", message: "gh not logged in" }) }, threaded);
    const card = await openCard(slot);

    typeReply(card);
    fireEvent.click(card.getByRole("button", { name: "Post" }));

    expect((await card.findByRole("alert")).textContent).toBe("gh not logged in");
    expect((card.getByRole("textbox", { name: "Reply" }) as HTMLTextAreaElement).value).toBe(REPLY);
    expect(slot.inspection.rpcCalls.map((call) => call.method)).toEqual(["getReview", "reply"]);
  });

  it("keeps the text when the reply call itself fails", async () => {
    const slot = renderTabWith({ reply: () => Promise.reject(new Error("host unreachable")) }, threaded);
    const card = await openCard(slot);

    typeReply(card);
    fireEvent.click(card.getByRole("button", { name: "Post" }));

    expect((await card.findByRole("alert")).textContent).toBe("host unreachable");
    expect((card.getByRole("textbox", { name: "Reply" }) as HTMLTextAreaElement).value).toBe(REPLY);
  });

  it("disables the box and the actions while a post runs", async () => {
    const slot = renderTabWith({ reply: () => new Promise<ReplyResult>(() => {}) }, threaded);
    const card = await openCard(slot);

    typeReply(card);
    fireEvent.click(card.getByRole("button", { name: "Post" }));

    await waitFor(() => expect(card.getByRole("textbox", { name: "Reply" }).hasAttribute("disabled")).toBe(true));
    for (const name of ["Post", "Post + resolve", "Resolve"]) {
      expect(card.getByRole("button", { name }).hasAttribute("disabled")).toBe(true);
    }
  });

  it("shows the resolve error after the reply was posted", async () => {
    const slot = renderTabWith(
      { reply: () => ({ kind: "posted", pendingReviewUrl: null, resolveError: "rate limited" }) },
      threaded,
    );
    const card = await openCard(slot);

    typeReply(card);
    fireEvent.click(card.getByRole("button", { name: "Post + resolve" }));

    expect((await card.findByRole("alert")).textContent).toBe("rate limited");
    expect((card.getByRole("textbox", { name: "Reply" }) as HTMLTextAreaElement).value).toBe("");
    await waitFor(() => expect(slot.inspection.rpcCalls.map((call) => call.method)).toEqual(["getReview", "reply", "getReview"]));
  });

  it("says when the reply went into the user's pending review", async () => {
    const prUrl = "https://github.com/collibra/frontend/pull/25259";
    const slot = renderTabWith({ reply: () => ({ kind: "posted", pendingReviewUrl: prUrl, resolveError: null }) }, threaded);
    const card = await openCard(slot);

    typeReply(card);
    fireEvent.click(card.getByRole("button", { name: "Post" }));

    const notice = await card.findByText("Reply added to your pending review.", { exact: false });
    expect(within(notice).getByRole("link", { name: "Open the PR" }).getAttribute("href")).toBe(prUrl);
  });

  it("resolves the thread and loads again", async () => {
    const slot = renderTab(threaded, resolvedPlaced());
    const card = await openCard(slot);

    fireEvent.click(card.getByRole("button", { name: "Resolve" }));

    await waitFor(() => expect(slot.queryByText(OPEN_THREAD, { exact: false })).toBeNull());
    expect(writeCalls(slot).map((call) => call.input)).toEqual([
      { threadId: "thr_1", reviewThreadId: PLACED, resolved: true },
    ]);
  });

  it("shows the error when the resolve fails", async () => {
    const slot = renderTabWith({ setResolved: () => ({ kind: "error", message: "rate limited" }) }, threaded);
    const card = await openCard(slot);

    fireEvent.click(card.getByRole("button", { name: "Resolve" }));

    expect((await card.findByRole("alert")).textContent).toBe("rate limited");
    expect(slot.inspection.rpcCalls.map((call) => call.method)).toEqual(["getReview", "setResolved"]);
  });

  it("unresolves a resolved thread, which has no reply box", async () => {
    const slot = renderTab(resolvedPlaced());

    fireEvent.click(await slot.findByRole("checkbox", { name: "Show resolved" }));
    fireEvent.click(slot.getByRole("button", { name: /a-bandziuk.*Resolved/ }));
    const card = within(slot.getByRole("button", { name: /a-bandziuk.*Resolved/ }).closest("article")!);
    expect(card.queryByRole("textbox", { name: "Reply" })).toBeNull();
    fireEvent.click(card.getByRole("button", { name: "Unresolve" }));

    await waitFor(() => expect(writeCalls(slot).map((call) => call.input)).toEqual([
      { threadId: "thr_1", reviewThreadId: PLACED, resolved: false },
    ]));
  });

  it("keeps the reply text when a thread above it in the file gets resolved", async () => {
    const [first, second] = threaded.threads.placed;
    const sameFile = { ...second!, thread: { ...second!.thread, path: first!.thread.path } };
    const before: ReviewResult = { ...threaded, threads: { ...threaded.threads, placed: [first!, sameFile] } };
    const after: ReviewResult = {
      ...before,
      threads: { ...before.threads, placed: [{ ...first!, thread: { ...first!.thread, resolved: true } }, sameFile] },
    };
    const slot = renderTab(before, after);
    const card = await openCard(slot);
    typeReply(card, "Half written");

    await slot.behavior.emitRealtime("review.updated", { threadId: "thr_1" });

    await waitFor(() => expect(slot.getAllByTestId("line-annotation")).toHaveLength(1));
    const moved = within(slot.getByTestId("line-annotation"));
    expect((moved.getByRole("textbox", { name: "Reply" }) as HTMLTextAreaElement).value).toBe("Half written");
  });
});
