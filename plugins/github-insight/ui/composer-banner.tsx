import { useBbNavigate, useComposerView } from "@get-bb/plugin-sdk/app";
import { bannerParts } from "../core/banner";
import { Icon } from "@/components/ui/icon";
import { useInsight } from "./use-insight";

export function ComposerBanner() {
  const { scope } = useComposerView();
  if (scope.kind !== "thread") return null;
  return <ThreadBanner threadId={scope.threadId} />;
}

function ThreadBanner({ threadId }: { threadId: string }) {
  const { result } = useInsight(threadId);
  const navigate = useBbNavigate();
  if (result?.kind !== "ok") return null;
  const parts = bannerParts(result.insight);
  if (parts.length === 0) return null;
  return (
    <button
      type="button"
      className="flex w-full min-w-0 items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
      onClick={() => navigate.openThreadPanel({ actionId: "pr" })}
    >
      <Icon name="AlertCircle" className="size-4 shrink-0 text-amber-500" />
      <span className="truncate">{parts.join(" · ")}</span>
    </button>
  );
}
