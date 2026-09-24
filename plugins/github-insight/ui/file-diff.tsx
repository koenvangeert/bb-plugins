import { useEffect, useMemo, useRef, useState } from "react";
import { parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { experimental_useCodeTheme as useCodeTheme } from "@get-bb/plugin-sdk/app";
import { gitPatch, type ReviewFile } from "../core/pr-files";

export function PrFileDiff({ file }: { file: ReviewFile }) {
  const fileDiff = useMemo(() => parseFileDiff(file), [file]);
  if (fileDiff === null) return <UnavailableFileDiff path={file.path} />;
  return <LazyFileDiff fileDiff={fileDiff} />;
}

function UnavailableFileDiff({ path }: { path: string }) {
  return (
    <section className="flex flex-col gap-1 border-b border-border px-3 py-2 text-sm">
      <span className="font-mono text-xs">{path}</span>
      <span className="text-muted-foreground">Diff not available</span>
    </section>
  );
}

function LazyFileDiff({ fileDiff }: { fileDiff: FileDiffMetadata }) {
  const { visible, ref } = useVisibleOnce<HTMLElement>();
  const theme = useCodeTheme();
  return (
    <section ref={ref} className="min-h-10 border-b border-border">
      {visible && (
        <FileDiff
          fileDiff={fileDiff}
          options={{ theme: theme.name, themeType: theme.mode, overflow: "wrap" }}
        />
      )}
    </section>
  );
}

function parseFileDiff(file: ReviewFile): FileDiffMetadata | null {
  const patch = gitPatch(file);
  if (patch === null) return null;
  try {
    const files = parsePatchFiles(patch, undefined, true).flatMap((parsed) => parsed.files);
    return files.length === 1 ? files[0]! : null;
  } catch {
    return null;
  }
}

function useVisibleOnce<T extends Element>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (visible || element === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);
  return { visible, ref };
}
