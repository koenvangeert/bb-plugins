import { cliCommand, defineCli, PluginCliError, type PluginCliContext } from "@get-bb/plugin-sdk";
import type { ReadTextFileRequest, ReadTextFileResult } from "../contract";
import { formatReviewList, reviewListEntries } from "../core/review-list";
import { MAX_THREAD_PAGES, type ReviewThread } from "../core/review-threads";
import type { ThreadPlacement } from "../core/thread-placement";
import type { ReviewService } from "./review-service";

interface ReviewCliDeps {
  review: ReviewService;
  readTextFile(hostId: string, request: ReadTextFileRequest): Promise<ReadTextFileResult>;
  now(): number;
}

export function createReviewCli(deps: ReviewCliDeps) {
  async function loadReview(ctx: PluginCliContext) {
    if (ctx.threadId === undefined) {
      throw new PluginCliError("Not running in a bb thread", {
        hint: "Run this command from an agent in a bb thread.",
      });
    }
    const load = await deps.review.load(ctx.threadId);
    if (load.kind === "no_pr") throw new PluginCliError("No pull request for this thread");
    if (load.kind === "error") throw new PluginCliError(load.message);
    return { ...load, threadId: ctx.threadId };
  }

  async function readBody(hostId: string, options: { body?: string; "body-file"?: string }, ctx: PluginCliContext) {
    const path = options["body-file"];
    if (path === undefined) return options.body ?? "";
    const result = await deps.readTextFile(hostId, { path, cwd: ctx.cwd ?? null });
    if (!result.ok) throw new PluginCliError(result.message);
    return result.text;
  }

  return defineCli({
    name: "github-insight",
    summary: "Review threads of this thread's pull request",
    commands: {
      "review list": cliCommand({
        summary: "List the unresolved review threads of this thread's PR, with a draft flag",
        options: { json: { type: "boolean", description: "Print JSON" } },
        run: async ({ options }, ctx) => {
          const { review } = await loadReview(ctx);
          const entries = reviewListEntries(review.threads, review.drafts);
          const stdout = options.json ? `${JSON.stringify({ threads: entries }, null, 2)}\n` : formatReviewList(entries);
          return { exitCode: 0, stdout };
        },
      }),
      "review draft": cliCommand({
        summary: "Save a draft reply for a review thread. Never posts to GitHub.",
        positionals: [{ name: "thread-id", description: "Review thread id from `review list`", required: true }],
        options: {
          body: { type: "string", placeholder: "text", description: "Draft text" },
          "body-file": {
            type: "string",
            placeholder: "path",
            description: "File with the draft text, max 64 KB, relative to the working directory",
          },
        },
        constraints: [{ kind: "exactly-one", options: ["body", "body-file"] }],
        run: async ({ positionals, options }, ctx) => {
          const reviewThreadId = positionals["thread-id"];
          const { threadId, target, allThreadsRead, review } = await loadReview(ctx);
          const thread = findThread(review.threads, reviewThreadId);
          if (thread === undefined) {
            throw new PluginCliError(`Unknown review thread: ${reviewThreadId}`, {
              hint: allThreadsRead
                ? "Run `bb github-insight review list` for the thread ids."
                : `Only the first ${MAX_THREAD_PAGES} pages of review threads were read.`,
            });
          }
          if (thread.resolved) throw new PluginCliError(`Review thread ${reviewThreadId} is resolved`);
          const body = await readBody(target.hostId, options, ctx);
          if (body.trim() === "") throw new PluginCliError("Draft is empty");
          await deps.review.saveDraft(threadId, target.ref, reviewThreadId, {
            body,
            updatedAt: deps.now(),
            source: "agent",
          });
          return { exitCode: 0, stdout: `Saved draft for ${reviewThreadId}\n` };
        },
      }),
    },
  });
}

function findThread(placement: ThreadPlacement, id: string): ReviewThread | undefined {
  return (
    placement.placed.find(({ thread }) => thread.id === id)?.thread ??
    placement.outdated.find((thread) => thread.id === id)
  );
}
