import { useCallback, type ReactNode } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "../contract";
import type { ReviewFile } from "../core/pr-files";
import { Notice, RefreshButton, RefreshError } from "./feedback";
import { PrFileDiff } from "./file-diff";
import { useThreadResult } from "./use-thread-result";

function useReview(threadId: string) {
  const rpc = useRpc<typeof rpcContract>();
  const fetchReview = useCallback(
    (id: string) => rpc.call("getReview", { threadId: id }),
    [rpc],
  );
  return useThreadResult(threadId, fetchReview);
}

export function ReviewTab({ threadId }: { threadId: string }) {
  const { result, refreshing, refresh } = useReview(threadId);
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
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
        <span>{filesChangedText(result.files)}</span>
        <RefreshButton refreshing={refreshing} refresh={refresh} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {result.files.map((file) => (
          <PrFileDiff key={file.path} file={file} />
        ))}
      </div>
    </div>
  );
}

function filesChangedText(files: readonly ReviewFile[]): string {
  return files.length === 1 ? "1 file changed" : `${files.length} files changed`;
}

function Padded({ children }: { children: ReactNode }) {
  return <div className="h-full overflow-y-auto p-3">{children}</div>;
}
