import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { prInsightSchema } from "./core/overview";
import { reviewFileSchema } from "./core/pr-files";
import { ghFailureSchema } from "./github/gh-failure";

const prRequestFields = {
  owner: z.string().min(1),
  repo: z.string().min(1),
  number: z.number().int().positive(),
};

const overviewPageRequestSchema = z
  .object({ ...prRequestFields, after: z.string().nullable() })
  .strict();
export type OverviewPageRequest = z.infer<typeof overviewPageRequestSchema>;

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

export const hostContract = defineRpcContract({
  fetchOverviewPage: {
    input: overviewPageRequestSchema,
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
  z.object({ kind: z.literal("ok"), files: z.array(reviewFileSchema) }),
]);
export type ReviewResult = z.infer<typeof reviewResultSchema>;

const threadRequestSchema = z.object({ threadId: z.string().min(1) }).strict();

export const rpcContract = defineRpcContract({
  getInsight: { input: threadRequestSchema, output: insightResultSchema },
  refresh: { input: threadRequestSchema, output: insightResultSchema },
  getReview: { input: threadRequestSchema, output: reviewResultSchema },
});
