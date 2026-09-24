import { z } from "zod";

export const checkRunNodeSchema = z.object({
  __typename: z.literal("CheckRun"),
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
});
export type CheckRunNode = z.infer<typeof checkRunNodeSchema>;

export const statusContextNodeSchema = z.object({
  __typename: z.literal("StatusContext"),
  context: z.string(),
  state: z.enum(["ERROR", "EXPECTED", "FAILURE", "PENDING", "SUCCESS"]),
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

const NOT_STARTED = Number.POSITIVE_INFINITY;

interface CheckCandidate {
  check: Check;
  recency: readonly [time: number, tieBreak: number];
}

function toCandidate(node: CheckNode): CheckCandidate {
  if (node.__typename === "CheckRun") {
    return {
      check: {
        name: node.name,
        status: mapCheckRunStatus(node.status, node.conclusion),
        url: node.detailsUrl,
      },
      recency: [
        node.startedAt === null ? NOT_STARTED : Date.parse(node.startedAt),
        node.databaseId,
      ],
    };
  }
  return {
    check: {
      name: node.context,
      status: mapStatusContextState(node.state),
      url: node.targetUrl,
    },
    recency: [Date.parse(node.createdAt), 0],
  };
}

function isNewer(candidate: CheckCandidate, current: CheckCandidate): boolean {
  const [candidateTime, candidateTieBreak] = candidate.recency;
  const [currentTime, currentTieBreak] = current.recency;
  if (candidateTime !== currentTime) return candidateTime > currentTime;
  return candidateTieBreak > currentTieBreak;
}

export function buildChecks(nodes: readonly CheckNode[]): Check[] {
  const newestByName = new Map<string, CheckCandidate>();
  for (const candidate of nodes.map(toCandidate)) {
    const current = newestByName.get(candidate.check.name);
    if (current === undefined || isNewer(candidate, current)) {
      newestByName.set(candidate.check.name, candidate);
    }
  }
  return [...newestByName.values()].map((candidate) => candidate.check);
}
