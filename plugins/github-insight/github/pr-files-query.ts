import type { PrFilesRequest } from "../contract";

export function prFilesArgs({ owner, repo, number }: PrFilesRequest): string[] {
  return [
    "api",
    "--paginate",
    "--slurp",
    `repos/${owner}/${repo}/pulls/${number}/files?per_page=100`,
  ];
}
