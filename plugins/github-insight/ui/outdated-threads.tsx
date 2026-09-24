import { useId } from "react";
import { experimental_Diff as Diff } from "@get-bb/plugin-sdk/app";
import type { Drafts } from "../core/drafts";
import type { ReviewThread } from "../core/review-threads";
import { ReviewThreadCard } from "./review-thread";

export function OutdatedThreads({ threads, drafts }: { threads: readonly ReviewThread[]; drafts: Drafts }) {
  const headingId = useId();
  if (threads.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 border-b border-border px-3 py-2">
      <h2 id={headingId} className="text-xs font-medium text-muted-foreground">
        Outdated
      </h2>
      {threads.map((thread) => (
        <OutdatedThread key={thread.id} thread={thread} drafts={drafts} />
      ))}
    </section>
  );
}

function OutdatedThread({ thread, drafts }: { thread: ReviewThread; drafts: Drafts }) {
  const snippet = thread.comments[0]?.diffHunk;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2 text-xs">
        <span className="font-mono">{thread.path}</span>
        <span className="text-muted-foreground">
          {thread.originalLine === null ? "Line unknown" : `Line ${thread.originalLine}`}
        </span>
      </div>
      {snippet !== undefined && <Diff patch={snippet} path={thread.path} />}
      <ReviewThreadCard thread={thread} draft={drafts[thread.id]} />
    </div>
  );
}
