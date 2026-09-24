import { z } from "zod";
import { checkFailure, checkFailureSchema, type Annotation } from "./failure";

export const checkRunNodeSchema = z.object({
  __typename: z.literal("CheckRun"),
  id: z.string(),
  databaseId: z.number(),
  name: z.string(),
  status: z.enum([
    "COMPLETED",
    "IN_PROGRESS",
    "PENDING",
    "QUEUED",
    "REQUESTED",
    "WAITING",
  ]),
  conclusion: z
    .enum([
      "ACTION_REQUIRED",
      "CANCELLED",
      "FAILURE",
      "NEUTRAL",
      "SKIPPED",
      "STALE",
      "STARTUP_FAILURE",
      "SUCCESS",
      "TIMED_OUT",
    ])
    .nullable(),
  detailsUrl: z.string().nullable(),
  startedAt: z.string().nullable(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
});
export type CheckRunNode = z.infer<typeof checkRunNodeSchema>;

export const statusContextNodeSchema = z.object({
  __typename: z.literal("StatusContext"),
  context: z.string(),
  state: z.enum(["ERROR", "EXPECTED", "FAILURE", "PENDING", "SUCCESS"]),
  description: z.string().nullable(),
  targetUrl: z.string().nullable(),
  createdAt: z.string(),
});
export type StatusContextNode = z.infer<typeof statusContextNodeSchema>;

export type CheckNode = CheckRunNode | StatusContextNode;

export const checkStatusSchema = z.enum([
  "failed",
  "running",
  "cancelled",
  "passed",
  "skipped",
]);
export type CheckStatus = z.infer<typeof checkStatusSchema>;

export const checkSchema = z.object({
  name: z.string(),
  status: checkStatusSchema,
  url: z.string().nullable(),
  failure: checkFailureSchema.nullable(),
});
export type Check = z.infer<typeof checkSchema>;

const CONCLUSION_STATUS: Record<
  NonNullable<CheckRunNode["conclusion"]>,
  CheckStatus
> = {
  FAILURE: "failed",
  TIMED_OUT: "failed",
  ACTION_REQUIRED: "failed",
  STARTUP_FAILURE: "failed",
  CANCELLED: "cancelled",
  STALE: "cancelled",
  SUCCESS: "passed",
  SKIPPED: "skipped",
  NEUTRAL: "skipped",
};

const CONTEXT_STATE_STATUS: Record<StatusContextNode["state"], CheckStatus> = {
  ERROR: "failed",
  FAILURE: "failed",
  PENDING: "running",
  EXPECTED: "running",
  SUCCESS: "passed",
};

export function mapCheckRunStatus(
  status: CheckRunNode["status"],
  conclusion: CheckRunNode["conclusion"],
): CheckStatus {
  if (status !== "COMPLETED" || conclusion === null) return "running";
  return CONCLUSION_STATUS[conclusion];
}

export function mapStatusContextState(
  state: StatusContextNode["state"],
): CheckStatus {
  return CONTEXT_STATE_STATUS[state];
}

const FAILING_STATUSES: ReadonlySet<CheckStatus> = new Set([
  "failed",
  "cancelled",
]);

const NOT_STARTED = Number.POSITIVE_INFINITY;

export interface CheckCandidate {
  name: string;
  status: CheckStatus;
  url: string | null;
  runId: string | null;
  reasonTexts: readonly (string | null)[];
  recency: readonly [time: number, tieBreak: number];
}

function toCandidate(node: CheckNode): CheckCandidate {
  if (node.__typename === "CheckRun") {
    return {
      name: node.name,
      status: mapCheckRunStatus(node.status, node.conclusion),
      url: node.detailsUrl,
      runId: node.id,
      reasonTexts: [node.title, node.summary],
      recency: [
        node.startedAt === null ? NOT_STARTED : Date.parse(node.startedAt),
        node.databaseId,
      ],
    };
  }
  return {
    name: node.context,
    status: mapStatusContextState(node.state),
    url: node.targetUrl,
    runId: null,
    // A status context has no annotations, so its description can come first.
    reasonTexts: [node.description],
    recency: [Date.parse(node.createdAt), 0],
  };
}

function isNewer(candidate: CheckCandidate, current: CheckCandidate): boolean {
  const [candidateTime, candidateTieBreak] = candidate.recency;
  const [currentTime, currentTieBreak] = current.recency;
  if (candidateTime !== currentTime) return candidateTime > currentTime;
  return candidateTieBreak > currentTieBreak;
}

export function latestCheckCandidates(
  nodes: readonly CheckNode[],
): CheckCandidate[] {
  const newestByName = new Map<string, CheckCandidate>();
  for (const candidate of nodes.map(toCandidate)) {
    const current = newestByName.get(candidate.name);
    if (current === undefined || isNewer(candidate, current)) {
      newestByName.set(candidate.name, candidate);
    }
  }
  return [...newestByName.values()];
}

export function failingCheckRunIds(
  candidates: readonly CheckCandidate[],
): string[] {
  return candidates.flatMap((candidate) =>
    candidate.runId !== null && FAILING_STATUSES.has(candidate.status)
      ? [candidate.runId]
      : [],
  );
}

export function toCheck(
  candidate: CheckCandidate,
  annotationsByRunId: ReadonlyMap<string, readonly Annotation[]>,
): Check {
  const { name, status, url, runId, reasonTexts } = candidate;
  const annotations =
    runId === null ? [] : (annotationsByRunId.get(runId) ?? []);
  return {
    name,
    status,
    url,
    failure: FAILING_STATUSES.has(status)
      ? checkFailure(reasonTexts, annotations)
      : null,
  };
}
