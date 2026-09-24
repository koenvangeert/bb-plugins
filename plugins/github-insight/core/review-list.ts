import type { Drafts } from "./drafts";
import type { ReviewThread } from "./review-threads";
import type { ThreadPlacement } from "./thread-placement";

export const MAX_LISTED_BODY_CHARS = 4000;

export interface ReviewListComment {
  author: string;
  createdAt: string;
  body: string;
  url: string;
}

export interface ReviewListEntry {
  id: string;
  path: string;
  line: number | null;
  outdated: boolean;
  hasDraft: boolean;
  hasMoreComments: boolean;
  comments: ReviewListComment[];
}

export function reviewListEntries(
  placement: ThreadPlacement,
  drafts: Drafts,
): ReviewListEntry[] {
  const entry = (thread: ReviewThread, line: number | null, outdated: boolean): ReviewListEntry => ({
    id: thread.id,
    path: thread.path,
    line,
    outdated,
    hasDraft: thread.id in drafts,
    hasMoreComments: thread.hasMoreComments,
    comments: thread.comments.map(({ author, createdAt, body, url }) => ({
      author,
      createdAt,
      body: capBody(body),
      url,
    })),
  });
  return [
    ...placement.placed
      .filter(({ thread }) => !thread.resolved)
      .map(({ thread, lineNumber }) => entry(thread, lineNumber, false)),
    ...placement.outdated
      .filter((thread) => !thread.resolved)
      .map((thread) => entry(thread, thread.originalLine, true)),
  ];
}

function capBody(body: string): string {
  if (body.length <= MAX_LISTED_BODY_CHARS) return body;
  return `${body.slice(0, MAX_LISTED_BODY_CHARS)}\n[cut at ${MAX_LISTED_BODY_CHARS} characters]`;
}

export function formatReviewList(entries: readonly ReviewListEntry[]): string {
  if (entries.length === 0) return "No unresolved review threads\n";
  return entries.map(formatEntry).join("\n");
}

function formatEntry(entry: ReviewListEntry): string {
  const tags = [entry.outdated && "[outdated]", entry.hasDraft && "[draft]"].filter(Boolean).join(" ");
  const heading = `${entry.id}  ${entry.path}:${entry.line ?? "?"}`;
  const lines = [tags === "" ? heading : `${heading}  ${tags}`];
  for (const comment of entry.comments) {
    lines.push(`  ${comment.author}, ${comment.createdAt}:`);
    lines.push(...comment.body.split("\n").map((text) => `    ${text}`));
  }
  if (entry.hasMoreComments) lines.push("  More comments on GitHub");
  return `${lines.join("\n")}\n`;
}
