import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { prInsightSchema } from "./core/overview";
import { ghFailureSchema } from "./github/gh-failure";

const overviewPageRequestSchema = z
  .object({
    owner: z.string().min(1),
    repo: z.string().min(1),
    number: z.number().int().positive(),
    after: z.string().nullable(),
  })
  .strict();
export type OverviewPageRequest = z.infer<typeof overviewPageRequestSchema>;

const checkRunDetailsRequestSchema = z
  .object({ ids: z.array(z.string().min(1)).min(1) })
  .strict();
export type CheckRunDetailsRequest = z.infer<typeof checkRunDetailsRequestSchema>;

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

const threadRequestSchema = z.object({ threadId: z.string().min(1) }).strict();

export const rpcContract = defineRpcContract({
  getInsight: { input: threadRequestSchema, output: insightResultSchema },
  refresh: { input: threadRequestSchema, output: insightResultSchema },
});
