import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "../contract";
import type { Drafts } from "../core/drafts";
import type { ReviewFile } from "../core/pr-files";
import { isReviewUpdateFor, REVIEW_UPDATED_CHANNEL } from "../core/review-updated";
import { openThreadCounts, type PlacedThread, type ThreadPlacement } from "../core/thread-placement";
import { Notice, RefreshButton, RefreshError } from "./feedback";
import { PrFileDiff } from "./file-diff";
import { OutdatedThreads } from "./outdated-threads";
import { ThreadActionsProvider } from "./thread-actions";
import { useThreadResult } from "./use-thread-result";

function useReview(threadId: string) {
  const rpc = useRpc<typeof rpcContract>();
  const fetchReview = useCallback(
    (id: string) => rpc.call("getReview", { threadId: id }),
    [rpc],
  );
  const state = useThreadResult(threadId, fetchReview);

  useRealtime(REVIEW_UPDATED_CHANNEL, (payload) => {
    if (isReviewUpdateFor(payload, threadId)) state.reload();
  });

  return state;
}

export function ReviewTab({ threadId }: { threadId: string }) {
  const { result, refreshing, refresh, reload } = useReview(threadId);
  if (result === null) return <Padded><Notice>Loading pull request…</Notice></Padded>;
  if (result.kind === "no_pr") {
    return <Padded><Notice>No pull request for this thread</Notice></Padded>;
  }
  if (result.kind === "error") {
    return (
      <Padded>
        <RefreshError message={result.message} refreshedAt={null} retry={refresh} busy={refreshing} />
      </Padded>
    );
  }
  return (
    <ThreadActionsProvider key={threadId} threadId={threadId} onWritten={reload}>
      <ReviewContent
        files={result.files}
        threads={result.threads}
        drafts={result.drafts}
        refreshing={refreshing}
        refresh={refresh}
      />
    </ThreadActionsProvider>
  );
}

interface ReviewContentProps {
  files: readonly ReviewFile[];
  threads: ThreadPlacement;
  drafts: Drafts;
  refreshing: boolean;
  refresh: () => void;
}

function ReviewContent({ files, threads, drafts, refreshing, refresh }: ReviewContentProps) {
  const [showResolved, setShowResolved] = useState(false);
  const visible = useMemo(() => visibleThreads(threads, showResolved), [threads, showResolved]);
  const placedByPath = useMemo(() => groupByPath(visible.placed), [visible.placed]);
  const counts = useMemo(() => openThreadCounts(threads), [threads]);
  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-2 text-xs text-muted-foreground">
        <span>{filesChangedText(files)}</span>
        <span>{counts.open} open</span>
        <span>{counts.outdated} outdated</span>
        <label className="ml-auto flex items-center gap-1">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(event) => setShowResolved(event.target.checked)}
          />
          Show resolved
        </label>
        <RefreshButton refreshing={refreshing} refresh={refresh} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <OutdatedThreads threads={visible.outdated} drafts={drafts} />
        {files.map((file) => (
          <PrFileDiff
            key={file.path}
            file={file}
            threads={placedByPath.get(file.path) ?? NO_THREADS}
            drafts={drafts}
          />
        ))}
      </div>
    </div>
  );
}

const NO_THREADS: readonly PlacedThread[] = [];

function visibleThreads(threads: ThreadPlacement, showResolved: boolean): ThreadPlacement {
  if (showResolved) return threads;
  return {
    placed: threads.placed.filter(({ thread }) => !thread.resolved),
    outdated: threads.outdated.filter((thread) => !thread.resolved),
  };
}

function groupByPath(placed: readonly PlacedThread[]): Map<string, PlacedThread[]> {
  const byPath = new Map<string, PlacedThread[]>();
  for (const entry of placed) {
    const threads = byPath.get(entry.thread.path);
    if (threads === undefined) byPath.set(entry.thread.path, [entry]);
    else threads.push(entry);
  }
  return byPath;
}

function filesChangedText(files: readonly ReviewFile[]): string {
  return files.length === 1 ? "1 file changed" : `${files.length} files changed`;
}

function Padded({ children }: { children: ReactNode }) {
  return <div className="h-full overflow-y-auto p-3">{children}</div>;
}
