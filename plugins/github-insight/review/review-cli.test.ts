import { afterEach, describe, expect, it, vi } from "vitest";
import prFiles from "../test/fixtures/pr-25259-files.json";
import reviewThreads from "../test/fixtures/pr-25259-review-threads.json";
import type { ReviewResult } from "../contract";
import plugin from "../server";
import { failed, linkedPr, ok, setup, type HostCall } from "../test/plugin-harness";

afterEach(() => {
  vi.useRealTimers();
});

describe("review CLI", () => {
  const OPEN = "PRRT_kwDOHI7l-86jxula";
  const RESOLVED = "PRRT_kwDOHI7l-86jvKxS";
  const READ_METHODS = ["fetchPrFiles", "fetchReviewThreads", "readTextFile"];

  function threadsWithResolved(threadId: string) {
    const pullRequest = reviewThreads.data.repository.pullRequest;
    return {
      data: {
        repository: {
          pullRequest: {
            ...pullRequest,
            reviewThreads: {
              ...pullRequest.reviewThreads,
              nodes: pullRequest.reviewThreads.nodes.map((node) =>
                node.id === threadId ? { ...node, isResolved: true } : node,
              ),
            },
          },
        },
      },
    };
  }

  function reviewHost(options: { threads?: () => unknown; file?: unknown } = {}) {
    return ({ method }: HostCall) => {
      if (method === "fetchPrFiles") return ok(prFiles);
      if (method === "fetchReviewThreads") return ok(options.threads?.() ?? reviewThreads);
      if (method === "readTextFile") return options.file ?? { ok: true, text: "From file" };
      throw new Error(`unexpected host call ${method}`);
    };
  }

  function setupWithPr(host = reviewHost()) {
    return setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25259) },
      host,
    });
  }

  async function draftsOf(harness: Awaited<ReturnType<typeof setup>>) {
    const result = (await harness.behavior.callRpc("getReview", { threadId: "thr_1" })) as ReviewResult;
    if (result.kind !== "ok") throw new Error(`expected ok, got ${result.kind}`);
    return result.drafts;
  }

  it("lists both review commands in help", async () => {
    const harness = await setupWithPr();

    const result = await harness.behavior.runCli(["review", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("list");
    expect(result.stdout).toContain("draft");
  });

  it.each([
    ["review", "list"],
    ["review", "draft", OPEN, "--body", "Done"],
  ])("fails outside a bb thread: %s %s", async (...argv) => {
    const harness = await setupWithPr();

    const result = await harness.behavior.runCli(argv, {});

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Not running in a bb thread");
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
  });

  it.each([
    ["review", "list"],
    ["review", "draft", OPEN, "--body", "Done"],
  ])("fails for a thread without a PR: %s %s", async (...argv) => {
    const harness = await setup({ threads: [{ id: "thr_1", environmentId: "env_1" }] });

    const result = await harness.behavior.runCli(argv, { threadId: "thr_1" });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("No pull request for this thread");
  });

  it("names the gh failure", async () => {
    const harness = await setupWithPr(() => failed({ kind: "gh_logged_out" }));

    const result = await harness.behavior.runCli(["review", "list"], { threadId: "thr_1" });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("gh not logged in");
  });

  it("lists the unresolved threads as JSON", async () => {
    const harness = await setupWithPr();

    const result = await harness.behavior.runCli(["review", "list", "--json"], { threadId: "thr_1" });

    expect(result.exitCode).toBe(0);
    const { threads } = JSON.parse(result.stdout) as { threads: { id: string; outdated: boolean }[] };
    expect(threads.map(({ id, outdated }) => [id, outdated])).toEqual([
      ["PRRT_kwDOHI7l-86jxqt3", false],
      [OPEN, false],
      ["PRRT_kwDOHI7l-86jx0SN", true],
    ]);
  });

  it("lists the unresolved threads as text", async () => {
    const harness = await setupWithPr();

    const result = await harness.behavior.runCli(["review", "list"], { threadId: "thr_1" });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`${OPEN}  apps/shell/e2e/catalog/integrations/components/asset/generic-configuration/createDatabricksOutboundSyncConfigurationComponent.ts:46`);
    expect(result.stdout).not.toContain(RESOLVED);
  });

  it("saves a draft, tells the open tab, and flags it in the list", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-24T10:00:00Z") });
    const harness = await setupWithPr();

    const saved = await harness.behavior.runCli(["review", "draft", OPEN, "--body", "Renamed in abc123"], {
      threadId: "thr_1",
    });

    expect(saved).toMatchObject({ exitCode: 0, stdout: `Saved draft for ${OPEN}\n` });
    expect(harness.realtimeSignals).toEqual([
      { channel: "review.updated", payload: { threadId: "thr_1" } },
    ]);
    expect(await draftsOf(harness)).toEqual({
      [OPEN]: { body: "Renamed in abc123", updatedAt: Date.parse("2026-09-24T10:00:00Z"), source: "agent" },
    });
    const listed = await harness.behavior.runCli(["review", "list", "--json"], { threadId: "thr_1" });
    const { threads } = JSON.parse(listed.stdout) as { threads: { id: string; hasDraft: boolean }[] };
    expect(threads.filter((thread) => thread.hasDraft).map((thread) => thread.id)).toEqual([OPEN]);
  });

  it("replaces the old draft of the same thread", async () => {
    const harness = await setupWithPr();

    await harness.behavior.runCli(["review", "draft", OPEN, "--body", "First"], { threadId: "thr_1" });
    await harness.behavior.runCli(["review", "draft", OPEN, "--body", "Second"], { threadId: "thr_1" });

    expect(await draftsOf(harness)).toEqual({ [OPEN]: expect.objectContaining({ body: "Second" }) });
  });

  it("reads --body-file on the thread's host, relative to the working directory", async () => {
    const harness = await setupWithPr();

    const result = await harness.behavior.runCli(["review", "draft", OPEN, "--body-file", "reply.md"], {
      threadId: "thr_1",
      cwd: "/work/repo",
    });

    expect(result.exitCode).toBe(0);
    expect(harness.experimental_hostRpcCalls).toContainEqual(
      expect.objectContaining({
        method: "readTextFile",
        hostId: "host-1",
        input: { path: "reply.md", cwd: "/work/repo" },
      }),
    );
    expect(await draftsOf(harness)).toEqual({ [OPEN]: expect.objectContaining({ body: "From file" }) });
  });

  it("names the file error and saves nothing", async () => {
    const harness = await setupWithPr(
      reviewHost({ file: { ok: false, message: "File not found: reply.md" } }),
    );

    const result = await harness.behavior.runCli(["review", "draft", OPEN, "--body-file", "reply.md"], {
      threadId: "thr_1",
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("File not found: reply.md");
    expect(await draftsOf(harness)).toEqual({});
  });

  it.each([
    [["--body", "a", "--body-file", "b.md"]],
    [[]],
  ])("needs exactly one of --body and --body-file: %j", async (bodyArgs) => {
    const harness = await setupWithPr();

    const result = await harness.behavior.runCli(["review", "draft", OPEN, ...bodyArgs], { threadId: "thr_1" });

    expect(result.exitCode).not.toBe(0);
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
  });

  it("refuses an empty draft", async () => {
    const harness = await setupWithPr();

    const result = await harness.behavior.runCli(["review", "draft", OPEN, "--body", "  \n"], {
      threadId: "thr_1",
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Draft is empty");
    expect(await draftsOf(harness)).toEqual({});
  });

  it("names an unknown thread id and saves nothing", async () => {
    const harness = await setupWithPr();

    const result = await harness.behavior.runCli(["review", "draft", "PRRT_typo", "--body", "Done"], {
      threadId: "thr_1",
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Unknown review thread: PRRT_typo");
    expect(harness.realtimeSignals).toHaveLength(0);
  });

  it("refuses a resolved thread", async () => {
    const harness = await setupWithPr();

    const result = await harness.behavior.runCli(["review", "draft", RESOLVED, "--body", "Done"], {
      threadId: "thr_1",
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain(`Review thread ${RESOLVED} is resolved`);
  });

  it("calls only the GitHub read handlers and readTextFile, never a GitHub write", async () => {
    const harness = await setupWithPr();

    await harness.behavior.runCli(["review", "list", "--json"], { threadId: "thr_1" });
    await harness.behavior.runCli(["review", "list"], { threadId: "thr_1" });
    await harness.behavior.runCli(["review", "draft", OPEN, "--body", "Done"], { threadId: "thr_1" });
    await harness.behavior.runCli(["review", "draft", OPEN, "--body-file", "reply.md"], { threadId: "thr_1" });

    const methods = new Set(harness.experimental_hostRpcCalls.map((call) => call.method));
    expect([...methods].sort()).toEqual(READ_METHODS);
  });

  it("hides the draft of a thread that got resolved", async () => {
    let threads: unknown = reviewThreads;
    const harness = await setupWithPr(reviewHost({ threads: () => threads }));
    await harness.behavior.runCli(["review", "draft", OPEN, "--body", "Done"], { threadId: "thr_1" });

    threads = threadsWithResolved(OPEN);

    expect(await draftsOf(harness)).toEqual({});
  });

  it("does not bring back the draft of a resolved thread when it is reopened", async () => {
    let threads: unknown = reviewThreads;
    const harness = await setupWithPr(reviewHost({ threads: () => threads }));
    await harness.behavior.runCli(["review", "draft", OPEN, "--body", "Done"], { threadId: "thr_1" });
    threads = threadsWithResolved(OPEN);
    await draftsOf(harness);

    threads = reviewThreads;

    expect(await draftsOf(harness)).toEqual({});
  });

  it("says that not all threads were read when an unknown id may be on a later page", async () => {
    const page = reviewThreads.data.repository.pullRequest;
    const endless = {
      data: {
        repository: {
          pullRequest: {
            ...page,
            reviewThreads: { ...page.reviewThreads, pageInfo: { hasNextPage: true, endCursor: "next" } },
          },
        },
      },
    };
    const harness = await setupWithPr(reviewHost({ threads: () => endless }));

    const result = await harness.behavior.runCli(["review", "draft", "PRRT_later", "--body", "Done"], {
      threadId: "thr_1",
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Unknown review thread: PRRT_later");
    expect(result.stderr).toContain("Only the first 5 pages of review threads were read.");
  });

  it("keeps a draft across a plugin reload", async () => {
    const harness = await setupWithPr();
    await harness.behavior.runCli(["review", "draft", OPEN, "--body", "Done"], { threadId: "thr_1" });

    const reloaded = await harness.reload(plugin);

    expect(await draftsOf(reloaded.harness)).toEqual({ [OPEN]: expect.objectContaining({ body: "Done" }) });
  });
});
