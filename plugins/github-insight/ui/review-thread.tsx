import { useState } from "react";
import { Markdown } from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import type { ReviewComment, ReviewThread } from "../core/review-threads";

export function ReviewThreadCard({ thread }: { thread: ReviewThread }) {
  const [expanded, setExpanded] = useState(false);
  const firstAuthor = thread.comments[0]?.author;
  return (
    <article className="my-1 flex flex-col rounded-md border border-border bg-background font-sans text-sm">
      {thread.resolved && (
        <button
          type="button"
          aria-expanded={expanded}
          className="flex items-center gap-1.5 px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted"
          onClick={() => setExpanded((current) => !current)}
        >
          <Icon name={expanded ? "ChevronDown" : "ChevronRight"} className="size-3.5" />
          <span className="font-medium text-foreground">{firstAuthor}</span>
          <span>Resolved</span>
        </button>
      )}
      {(!thread.resolved || expanded) && (
        <>
          {thread.comments.map((comment) => (
            <CommentView key={comment.id} comment={comment} />
          ))}
          {thread.hasMoreComments && <MoreCommentsLink thread={thread} />}
        </>
      )}
    </article>
  );
}

function CommentView({ comment }: { comment: ReviewComment }) {
  const createdAt = new Date(comment.createdAt);
  return (
    <div className="flex flex-col gap-1 border-t border-border px-3 py-2 first:border-t-0">
      <div className="flex items-baseline gap-2 text-xs">
        <span className="font-medium">{comment.author}</span>
        <a href={comment.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:underline">
          <time dateTime={createdAt.toISOString()}>
            {createdAt.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
          </time>
        </a>
      </div>
      <Markdown content={comment.body} />
    </div>
  );
}

function MoreCommentsLink({ thread }: { thread: ReviewThread }) {
  const url = thread.comments.at(-1)?.url;
  if (url === undefined) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground hover:underline">
      More comments on GitHub
    </a>
  );
}
