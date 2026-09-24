import type { ReplyRequest, ReplyResult, SetResolvedRequest, SetResolvedResult } from "../contract";
import { pullRequestUrl } from "../core/pr-ref";
import { GhFailureError, ghFailureText } from "../github/gh-failure";
import { isPendingReply } from "../github/review-thread-mutations";
import type { PrResolution, PrTarget } from "../pr-lookup";

interface ReviewWritesDeps {
  resolvePr(threadId: string): Promise<PrResolution>;
  replyToThread(target: PrTarget, reviewThreadId: string, body: string): Promise<unknown>;
  setThreadResolved(target: PrTarget, reviewThreadId: string, resolved: boolean): Promise<unknown>;
}

type Written<T> = { ok: true; value: T } | { ok: false; message: string };

async function write<T>(run: () => Promise<T>): Promise<Written<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    if (error instanceof GhFailureError) return { ok: false, message: ghFailureText(error.failure) };
    if (error instanceof Error) return { ok: false, message: error.message };
    throw error;
  }
}

const NO_PR_MESSAGE = "No pull request for this thread";

export function createReviewWrites(deps: ReviewWritesDeps) {
  async function targetOf(threadId: string): Promise<Written<PrTarget>> {
    const resolution = await deps.resolvePr(threadId);
    if (resolution.kind === "pr") return { ok: true, value: resolution.target };
    return { ok: false, message: resolution.kind === "error" ? resolution.message : NO_PR_MESSAGE };
  }

  async function reply({ threadId, reviewThreadId, body, resolve }: ReplyRequest): Promise<ReplyResult> {
    const target = await targetOf(threadId);
    if (!target.ok) return { kind: "post_failed", message: target.message };
    const posted = await write(() => deps.replyToThread(target.value, reviewThreadId, body));
    if (!posted.ok) return { kind: "post_failed", message: posted.message };
    const pendingReviewUrl = isPendingReply(posted.value) ? pullRequestUrl(target.value.ref) : null;
    if (!resolve) return { kind: "posted", pendingReviewUrl, resolveError: null };
    const resolved = await write(() => deps.setThreadResolved(target.value, reviewThreadId, true));
    return { kind: "posted", pendingReviewUrl, resolveError: resolved.ok ? null : resolved.message };
  }

  async function setResolved({ threadId, reviewThreadId, resolved }: SetResolvedRequest): Promise<SetResolvedResult> {
    const target = await targetOf(threadId);
    if (!target.ok) return { kind: "error", message: target.message };
    const written = await write(() => deps.setThreadResolved(target.value, reviewThreadId, resolved));
    return written.ok ? { kind: "ok" } : { kind: "error", message: written.message };
  }

  return { reply, setResolved };
}
