import { z } from "zod";
import type { ReviewFile } from "./pr-files";
import { reviewThreadSchema, type ReviewThread } from "./review-threads";

export const placedThreadSchema = z.object({
  thread: reviewThreadSchema,
  side: z.enum(["additions", "deletions"]),
  lineNumber: z.number(),
});
export type PlacedThread = z.infer<typeof placedThreadSchema>;

export const threadPlacementSchema = z.object({
  placed: z.array(placedThreadSchema),
  outdated: z.array(reviewThreadSchema),
});
export type ThreadPlacement = z.infer<typeof threadPlacementSchema>;

interface DiffLines {
  additions: Set<number>;
  deletions: Set<number>;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function diffLines(patch: string): DiffLines {
  const lines: DiffLines = { additions: new Set(), deletions: new Set() };
  let oldLine = 0;
  let newLine = 0;
  for (const text of patch.split("\n")) {
    const header = HUNK_HEADER.exec(text);
    if (header !== null) {
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
    } else if (text.startsWith("+")) {
      lines.additions.add(newLine++);
    } else if (text.startsWith("-")) {
      lines.deletions.add(oldLine++);
    } else if (text.startsWith(" ")) {
      lines.additions.add(newLine++);
      lines.deletions.add(oldLine++);
    }
  }
  return lines;
}

export function placeThreads(files: ReviewFile[], threads: ReviewThread[]): ThreadPlacement {
  const linesByPath = new Map(
    files.flatMap((file) => (file.patch === null ? [] : [[file.path, diffLines(file.patch)] as const])),
  );
  const placement: ThreadPlacement = { placed: [], outdated: [] };
  for (const thread of threads) {
    const side = thread.side === "RIGHT" ? "additions" : "deletions";
    const lines = linesByPath.get(thread.path);
    if (thread.outdated || thread.line === null || !lines?.[side].has(thread.line)) {
      placement.outdated.push(thread);
    } else {
      placement.placed.push({ thread, side, lineNumber: thread.line });
    }
  }
  return placement;
}

export function openThreadCounts(placement: ThreadPlacement): { open: number; outdated: number } {
  const outdated = placement.outdated.filter((thread) => !thread.resolved).length;
  const placed = placement.placed.filter(({ thread }) => !thread.resolved).length;
  return { open: placed + outdated, outdated };
}
