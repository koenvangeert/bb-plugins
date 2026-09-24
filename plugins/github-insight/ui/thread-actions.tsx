import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "../contract";

export interface ThreadActionState {
  replyText: string;
  busy: boolean;
  error: string | null;
  pendingReviewUrl: string | null;
}

const IDLE: ThreadActionState = { replyText: "", busy: false, error: null, pendingReviewUrl: null };

interface ThreadActions {
  stateOf(reviewThreadId: string): ThreadActionState;
  setReplyText(reviewThreadId: string, text: string): void;
  post(reviewThreadId: string, options: { resolve: boolean }): Promise<void>;
  setResolved(reviewThreadId: string, resolved: boolean): Promise<void>;
}

const ThreadActionsContext = createContext<ThreadActions | null>(null);

export function ThreadActionsProvider({
  threadId,
  onWritten,
  children,
}: {
  threadId: string;
  onWritten: () => void;
  children: ReactNode;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const [states, setStates] = useState<Record<string, ThreadActionState>>({});
  const busyIds = useRef(new Set<string>());

  const update = useCallback((reviewThreadId: string, patch: Partial<ThreadActionState>) => {
    setStates((current) => ({ ...current, [reviewThreadId]: { ...(current[reviewThreadId] ?? IDLE), ...patch } }));
  }, []);

  const runExclusive = useCallback(
    async (reviewThreadId: string, run: () => Promise<Partial<ThreadActionState>>) => {
      if (busyIds.current.has(reviewThreadId)) return;
      busyIds.current.add(reviewThreadId);
      update(reviewThreadId, { busy: true, error: null });
      try {
        update(reviewThreadId, { ...(await run()), busy: false });
      } finally {
        busyIds.current.delete(reviewThreadId);
      }
    },
    [update],
  );

  const post = useCallback(
    (reviewThreadId: string, { resolve }: { resolve: boolean }) => {
      const body = states[reviewThreadId]?.replyText ?? "";
      return runExclusive(reviewThreadId, async () => {
        const result = await rpc
          .call("reply", { threadId, reviewThreadId, body, resolve })
          .catch((error: unknown) => ({ kind: "post_failed" as const, message: messageOf(error) }));
        if (result.kind === "post_failed") return { error: result.message, pendingReviewUrl: null };
        onWritten();
        return { replyText: "", error: result.resolveError, pendingReviewUrl: result.pendingReviewUrl };
      });
    },
    [rpc, threadId, states, runExclusive, onWritten],
  );

  const setResolved = useCallback(
    (reviewThreadId: string, resolved: boolean) =>
      runExclusive(reviewThreadId, async () => {
        const result = await rpc
          .call("setResolved", { threadId, reviewThreadId, resolved })
          .catch((error: unknown) => ({ kind: "error" as const, message: messageOf(error) }));
        if (result.kind === "error") return { error: result.message };
        onWritten();
        return { error: null };
      }),
    [rpc, threadId, runExclusive, onWritten],
  );

  const actions = useMemo<ThreadActions>(
    () => ({
      stateOf: (reviewThreadId) => states[reviewThreadId] ?? IDLE,
      setReplyText: (reviewThreadId, replyText) => update(reviewThreadId, { replyText }),
      post,
      setResolved,
    }),
    [states, update, post, setResolved],
  );

  return <ThreadActionsContext.Provider value={actions}>{children}</ThreadActionsContext.Provider>;
}

export function useThreadActions(): ThreadActions {
  const actions = useContext(ThreadActionsContext);
  if (actions === null) throw new Error("useThreadActions needs a ThreadActionsProvider");
  return actions;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
