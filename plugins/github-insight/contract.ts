import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { draftsSchema } from "./core/drafts";
import { prInsightSchema } from "./core/overview";
import { reviewFileSchema } from "./core/pr-files";
import { threadPlacementSchema } from "./core/thread-placement";
import { ghFailureSchema } from "./github/gh-failure";

const prRequestFields = {
  owner: z.string().min(1),
  repo: z.string().min(1),
  number: z.number().int().positive(),
};

const prPageRequestSchema = z
  .object({ ...prRequestFields, after: z.string().nullable() })
  .strict();
export type PrPageRequest = z.infer<typeof prPageRequestSchema>;

const checkRunDetailsRequestSchema = z
  .object({ ids: z.array(z.string().min(1)).min(1) })
  .strict();
export type CheckRunDetailsRequest = z.infer<typeof checkRunDetailsRequestSchema>;

const prFilesRequestSchema = z.object(prRequestFields).strict();
export type PrFilesRequest = z.infer<typeof prFilesRequestSchema>;

const ghResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.unknown() }),
  z.object({ ok: z.literal(false), failure: ghFailureSchema }),
]);
export type GhResult = z.infer<typeof ghResultSchema>;

const readTextFileRequestSchema = z
  .object({ path: z.string().min(1), cwd: z.string().nullable() })
  .strict();
export type ReadTextFileRequest = z.infer<typeof readTextFileRequestSchema>;

const readTextFileResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), text: z.string() }),
  z.object({ ok: z.literal(false), message: z.string() }),
]);
export type ReadTextFileResult = z.infer<typeof readTextFileResultSchema>;

const replyToThreadRequestSchema = z
  .object({ threadId: z.string().min(1), body: z.string().min(1) })
  .strict();
export type ReplyToThreadRequest = z.infer<typeof replyToThreadRequestSchema>;

const setThreadResolvedRequestSchema = z
  .object({ threadId: z.string().min(1), resolved: z.boolean() })
  .strict();
export type SetThreadResolvedRequest = z.infer<typeof setThreadResolvedRequestSchema>;

export const hostContract = defineRpcContract({
  fetchOverviewPage: {
    input: prPageRequestSchema,
    output: ghResultSchema,
  },
  fetchCheckRunDetails: {
    input: checkRunDetailsRequestSchema,
    output: ghResultSchema,
  },
  fetchPrFiles: {
    input: prFilesRequestSchema,
    output: ghResultSchema,
  },
  fetchReviewThreads: {
    input: prPageRequestSchema,
    output: ghResultSchema,
  },
  readTextFile: {
    input: readTextFileRequestSchema,
    output: readTextFileResultSchema,
  },
  replyToThread: {
    input: replyToThreadRequestSchema,
    output: ghResultSchema,
  },
  setThreadResolved: {
    input: setThreadResolvedRequestSchema,
    output: ghResultSchema,
  },
});

export const insightResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("no_pr") }),
  z.object({ kind: z.literal("error"), message: z.string() }),
  z.object({
    kind: z.literal("ok"),
    insight: prInsightSchema,
    refreshedAt: z.number(),
    error: z.string().nullable(),
  }),
]);
export type InsightResult = z.infer<typeof insightResultSchema>;

export const reviewResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("no_pr") }),
  z.object({ kind: z.literal("error"), message: z.string() }),
  z.object({
    kind: z.literal("ok"),
    files: z.array(reviewFileSchema),
    threads: threadPlacementSchema,
    drafts: draftsSchema,
  }),
]);
export type ReviewResult = z.infer<typeof reviewResultSchema>;

const threadRequestSchema = z.object({ threadId: z.string().min(1) }).strict();

const replyRequestSchema = z
  .object({
    threadId: z.string().min(1),
    reviewThreadId: z.string().min(1),
    body: z.string().regex(/\S/),
    resolve: z.boolean(),
  })
  .strict();
export type ReplyRequest = z.infer<typeof replyRequestSchema>;

export const replyResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("posted"),
    pendingReviewUrl: z.string().nullable(),
    resolveError: z.string().nullable(),
  }),
  z.object({ kind: z.literal("post_failed"), message: z.string() }),
]);
export type ReplyResult = z.infer<typeof replyResultSchema>;

const setResolvedRequestSchema = z
  .object({
    threadId: z.string().min(1),
    reviewThreadId: z.string().min(1),
    resolved: z.boolean(),
  })
  .strict();
export type SetResolvedRequest = z.infer<typeof setResolvedRequestSchema>;

export const setResolvedResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ok") }),
  z.object({ kind: z.literal("error"), message: z.string() }),
]);
export type SetResolvedResult = z.infer<typeof setResolvedResultSchema>;

export const rpcContract = defineRpcContract({
  getInsight: { input: threadRequestSchema, output: insightResultSchema },
  refresh: { input: threadRequestSchema, output: insightResultSchema },
  getReview: { input: threadRequestSchema, output: reviewResultSchema },
  reply: { input: replyRequestSchema, output: replyResultSchema },
  setResolved: { input: setResolvedRequestSchema, output: setResolvedResultSchema },
});
