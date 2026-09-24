import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { prInsightSchema } from "./core/overview";

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

export const hostContract = defineRpcContract({
  fetchOverviewPage: {
    input: overviewPageRequestSchema,
    output: z.unknown(),
  },
  fetchCheckRunDetails: {
    input: checkRunDetailsRequestSchema,
    output: z.unknown(),
  },
});

export const insightResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("no_pr") }),
  z.object({ kind: z.literal("error"), message: z.string() }),
  z.object({ kind: z.literal("ok"), insight: prInsightSchema }),
]);
export type InsightResult = z.infer<typeof insightResultSchema>;

export const rpcContract = defineRpcContract({
  getInsight: {
    input: z.object({ threadId: z.string().min(1) }).strict(),
    output: insightResultSchema,
  },
});
