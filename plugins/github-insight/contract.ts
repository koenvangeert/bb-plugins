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

const sendToAgentRequestSchema = z
  .object({ threadId: z.string().min(1), reviewThreadIds: z.array(z.string().min(1)).min(1) })
  .strict();

export const sendToAgentResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("sent"), delivery: z.enum(["sent", "queued"]), threadCount: z.number() }),
  z.object({ kind: z.literal("error"), message: z.string() }),
]);
export type SendToAgentResult = z.infer<typeof sendToAgentResultSchema>;

export const rpcContract = defineRpcContract({
  getInsight: { input: threadRequestSchema, output: insightResultSchema },
  refresh: { input: threadRequestSchema, output: insightResultSchema },
  getReview: { input: threadRequestSchema, output: reviewResultSchema },
  sendToAgent: { input: sendToAgentRequestSchema, output: sendToAgentResultSchema },
});
