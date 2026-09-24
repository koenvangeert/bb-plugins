import { useCallback, useEffect, useRef, useState } from "react";

export type LoadMode = "load" | "refresh";

interface ErrorResult {
  kind: "error";
  message: string;
}

export interface ThreadResultState<R> {
  result: R | ErrorResult | null;
  refreshing: boolean;
  reload: () => void;
  refresh: () => void;
}

export function useThreadResult<R>(
  threadId: string,
  fetch: (threadId: string, mode: LoadMode) => Promise<R>,
): ThreadResultState<R> {
  const [loaded, setLoaded] = useState<{
    threadId: string;
    result: R | ErrorResult;
  } | null>(null);
  const [refreshingThreadId, setRefreshingThreadId] = useState<string | null>(null);
  const latestRequest = useRef(0);

  const load = useCallback(
    async (mode: LoadMode) => {
      const request = ++latestRequest.current;
      const result = await fetch(threadId, mode).catch(
        (error: unknown): ErrorResult => ({
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      if (request === latestRequest.current) setLoaded({ threadId, result });
    },
    [fetch, threadId],
  );

  useEffect(() => {
    void load("load");
    return () => {
      latestRequest.current++;
    };
  }, [load]);

  const reload = useCallback(() => void load("load"), [load]);

  const refresh = useCallback(() => {
    setRefreshingThreadId(threadId);
    void load("refresh").finally(() =>
      setRefreshingThreadId((current) => (current === threadId ? null : current)),
    );
  }, [load, threadId]);

  const result = loaded?.threadId === threadId ? loaded.result : null;
  return { result, refreshing: refreshingThreadId === threadId, reload, refresh };
}
