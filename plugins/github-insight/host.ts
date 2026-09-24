import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { hostContract, type GhResult } from "./contract";
import { checkRunDetailsArgs } from "./github/check-run-details-query";
import {
  classifyGhFailure,
  parseGraphqlRateLimitReset,
  RATE_LIMIT_ARGS,
  type GhProcessError,
} from "./github/gh-failure";
import { overviewPageArgs } from "./github/overview-query";

const execFileAsync = promisify(execFile);

export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    fetchOverviewPage: (request, context) =>
      runGhJson(overviewPageArgs(request), context.signal),
    fetchCheckRunDetails: (request, context) =>
      runGhJson(checkRunDetailsArgs(request), context.signal),
  },
});

async function gh(args: string[], signal: AbortSignal): Promise<unknown> {
  const { stdout } = await execFileAsync("gh", args, {
    signal,
    maxBuffer: 8 * 1024 * 1024,
  });
  return JSON.parse(stdout) as unknown;
}

async function runGhJson(args: string[], signal: AbortSignal): Promise<GhResult> {
  try {
    return { ok: true, data: await gh(args, signal) };
  } catch (error) {
    const failure = classifyGhFailure(processError(error));
    if (failure.kind !== "rate_limited") return { ok: false, failure };
    return {
      ok: false,
      failure: { ...failure, resetAt: await readRateLimitReset(signal) },
    };
  }
}

// GitHub does not count `gh api rate_limit` against the rate limit.
async function readRateLimitReset(signal: AbortSignal): Promise<number | null> {
  try {
    return parseGraphqlRateLimitReset(await gh(RATE_LIMIT_ARGS, signal));
  } catch {
    return null;
  }
}

function processError(error: unknown): GhProcessError {
  const fields = typeof error === "object" && error !== null ? error : {};
  const code = "code" in fields ? fields.code : undefined;
  return {
    code: typeof code === "string" || typeof code === "number" ? code : undefined,
    stderr: "stderr" in fields ? String(fields.stderr) : "",
    message: error instanceof Error ? error.message : String(error),
  };
}
