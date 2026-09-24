import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { InsightResult, rpcContract } from "../contract";
import { INSIGHT_UPDATED_CHANNEL, mentionsThread } from "../core/insight-updated";

interface InsightState {
  result: InsightResult | null;
  refreshing: boolean;
  refresh: () => void;
}

export function useInsight(threadId: string): InsightState {
  const rpc = useRpc<typeof rpcContract>();
  const [loaded, setLoaded] = useState<{ threadId: string; result: InsightResult } | null>(
    null,
  );
  const [refreshingThreadId, setRefreshingThreadId] = useState<string | null>(null);
  const latestRequest = useRef(0);

  const load = useCallback(
    async (method: "getInsight" | "refresh") => {
      const request = ++latestRequest.current;
      const result = await rpc.call(method, { threadId }).catch(
        (error: unknown): InsightResult => ({
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      if (request === latestRequest.current) setLoaded({ threadId, result });
    },
    [rpc, threadId],
  );

  useEffect(() => {
    void load("getInsight");
    return () => {
      latestRequest.current++;
    };
  }, [load]);

  useRealtime(INSIGHT_UPDATED_CHANNEL, (payload) => {
    if (mentionsThread(payload, threadId)) void load("getInsight");
  });

  const refresh = useCallback(() => {
    setRefreshingThreadId(threadId);
    void load("refresh").finally(() =>
      setRefreshingThreadId((current) => (current === threadId ? null : current)),
    );
  }, [load, threadId]);

  const result = loaded?.threadId === threadId ? loaded.result : null;
  return { result, refreshing: refreshingThreadId === threadId, refresh };
}
