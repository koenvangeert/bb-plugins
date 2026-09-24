import { useCallback } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "../contract";
import { INSIGHT_UPDATED_CHANNEL, mentionsThread } from "../core/insight-updated";
import { useThreadResult, type LoadMode } from "./use-thread-result";

export function useInsight(threadId: string) {
  const rpc = useRpc<typeof rpcContract>();
  const fetchInsight = useCallback(
    (id: string, mode: LoadMode) =>
      rpc.call(mode === "refresh" ? "refresh" : "getInsight", { threadId: id }),
    [rpc],
  );
  const state = useThreadResult(threadId, fetchInsight);

  useRealtime(INSIGHT_UPDATED_CHANNEL, (payload) => {
    if (mentionsThread(payload, threadId)) state.reload();
  });

  return state;
}
