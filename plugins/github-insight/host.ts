import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { hostContract } from "./contract";
import { overviewPageArgs } from "./github/overview-query";

const execFileAsync = promisify(execFile);

export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    fetchOverviewPage: async (request, context) => {
      try {
        const { stdout } = await execFileAsync("gh", overviewPageArgs(request), {
          signal: context.signal,
          maxBuffer: 8 * 1024 * 1024,
        });
        return JSON.parse(stdout) as unknown;
      } catch (error) {
        throw new Error(ghFailureMessage(error));
      }
    },
  },
});

function ghFailureMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "stderr" in error) {
    const stderr = String(error.stderr).trim();
    if (stderr !== "") return stderr;
  }
  return error instanceof Error ? error.message : String(error);
}
