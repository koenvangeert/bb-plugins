import { useEffect, useMemo, useRef, useState } from "react";
import { parsePatchFiles, type DiffLineAnnotation, type FileDiffMetadata } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { experimental_useCodeTheme as useCodeTheme } from "@get-bb/plugin-sdk/app";
import { gitPatch, type ReviewFile } from "../core/pr-files";
import type { Draft, Drafts } from "../core/drafts";
import type { ReviewThread } from "../core/review-threads";
import type { PlacedThread } from "../core/thread-placement";
import { ReviewThreadCard } from "./review-thread";

interface ThreadsProps {
  threads: readonly PlacedThread[];
  drafts: Drafts;
}

interface ThreadAnnotation {
  thread: ReviewThread;
  draft: Draft | undefined;
}

export function PrFileDiff({ file, threads, drafts }: ThreadsProps & { file: ReviewFile }) {
  const fileDiff = useMemo(() => parseFileDiff(file), [file]);
  if (fileDiff === null) return <UnavailableFileDiff path={file.path} threads={threads} drafts={drafts} />;
  return <LazyFileDiff fileDiff={fileDiff} threads={threads} drafts={drafts} />;
}

function UnavailableFileDiff({ path, threads, drafts }: ThreadsProps & { path: string }) {
  return (
    <section className="flex flex-col gap-1 border-b border-border px-3 py-2 text-sm">
      <span className="font-mono text-xs">{path}</span>
      <span className="text-muted-foreground">Diff not available</span>
      {threads.map(({ thread }) => (
        <ReviewThreadCard key={thread.id} thread={thread} draft={drafts[thread.id]} />
      ))}
    </section>
  );
}

function LazyFileDiff({ fileDiff, threads, drafts }: ThreadsProps & { fileDiff: FileDiffMetadata }) {
  const { visible, ref } = useVisibleOnce<HTMLElement>();
  const theme = useCodeTheme();
  const lineAnnotations = useMemo(
    () =>
      threads.map(({ thread, side, lineNumber }): DiffLineAnnotation<ThreadAnnotation> => ({
        side,
        lineNumber,
        metadata: { thread, draft: drafts[thread.id] },
      })),
    [threads, drafts],
  );
  return (
    <section ref={ref} className="min-h-10 border-b border-border">
      {visible && (
        <FileDiff
          fileDiff={fileDiff}
          options={{ theme: theme.name, themeType: theme.mode, overflow: "wrap" }}
          lineAnnotations={lineAnnotations}
          renderAnnotation={({ metadata }) => (
            <ReviewThreadCard key={metadata.thread.id} thread={metadata.thread} draft={metadata.draft} />
          )}
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
