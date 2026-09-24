import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

const BUTTON_CLASS =
  "inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted disabled:opacity-60";

export function RefreshButton({ refreshing, refresh }: { refreshing: boolean; refresh: () => void }) {
  return (
    <button type="button" className={BUTTON_CLASS} onClick={refresh} disabled={refreshing}>
      <Icon
        name="ArrowReloadHorizontal"
        className={cn("size-3.5", refreshing && "animate-spin")}
      />
      {refreshing ? "Refreshing…" : "Refresh"}
    </button>
  );
}

interface RefreshErrorProps {
  message: string;
  refreshedAt: number | null;
  retry: () => void;
  busy: boolean;
}

export function RefreshError({ message, refreshedAt, retry, busy }: RefreshErrorProps) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 rounded-lg border border-destructive/40 px-3 py-2 text-sm"
    >
      <Icon name="AlertCircle" className="size-4 shrink-0 text-destructive" />
      <div className="flex min-w-0 flex-col">
        <span className="break-words text-destructive">{message}</span>
        {refreshedAt !== null && (
          <span className="text-xs text-muted-foreground">
            Last updated{" "}
            <time dateTime={new Date(refreshedAt).toISOString()}>
              {new Date(refreshedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </span>
        )}
      </div>
      <button type="button" className={cn(BUTTON_CLASS, "ml-auto")} onClick={retry} disabled={busy}>
        Retry
      </button>
    </div>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
    >
      {children}
    </div>
  );
}
