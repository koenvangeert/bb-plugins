import { useId, useState } from "react";
import { Markdown } from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import type { Draft } from "../core/drafts";
import type { ReviewComment, ReviewThread } from "../core/review-threads";
import { useThreadActions } from "./thread-actions";

export function ReviewThreadCard({ thread, draft }: { thread: ReviewThread; draft: Draft | undefined }) {
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
          {draft !== undefined && <DraftView draft={draft} />}
          <ThreadActionsView thread={thread} />
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

function DraftView({ draft }: { draft: Draft }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1 border-t border-border bg-muted/50 px-3 py-2">
      <h3 id={headingId} className="text-xs font-medium text-muted-foreground">
        Draft from agent
      </h3>
      <p className="whitespace-pre-wrap">{draft.body}</p>
    </section>
  );
}

const ACTION_BUTTON_CLASS =
  "inline-flex shrink-0 items-center rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted disabled:opacity-60";

function ThreadActionsView({ thread }: { thread: ReviewThread }) {
  const actions = useThreadActions();
  const { replyText, busy, error, pendingReviewUrl } = actions.stateOf(thread.id);
  const canPost = !busy && replyText.trim() !== "";
  return (
    <div className="flex flex-col gap-1.5 border-t border-border px-3 py-2">
      {!thread.resolved && (
        <textarea
          aria-label="Reply"
          placeholder="Reply…"
          rows={2}
          className="w-full resize-y rounded-md border border-border bg-background px-2 py-1 text-sm"
          value={replyText}
          disabled={busy}
          onChange={(event) => actions.setReplyText(thread.id, event.target.value)}
        />
      )}
      {error !== null && (
        <p role="alert" className="break-words text-xs text-destructive">
          {error}
        </p>
      )}
      {pendingReviewUrl !== null && (
        <p role="status" className="text-xs text-muted-foreground">
          Reply added to your pending review.{" "}
          <a href={pendingReviewUrl} target="_blank" rel="noreferrer" className="hover:underline">
            Open the PR
          </a>
        </p>
      )}
      <div className="flex gap-1.5">
        {thread.resolved ? (
          <button type="button" className={ACTION_BUTTON_CLASS} disabled={busy} onClick={() => void actions.setResolved(thread.id, false)}>
            Unresolve
          </button>
        ) : (
          <>
            <button type="button" className={ACTION_BUTTON_CLASS} disabled={!canPost} onClick={() => void actions.post(thread.id, { resolve: false })}>
              Post
            </button>
            <button type="button" className={ACTION_BUTTON_CLASS} disabled={!canPost} onClick={() => void actions.post(thread.id, { resolve: true })}>
              Post + resolve
            </button>
            <button type="button" className={`${ACTION_BUTTON_CLASS} ml-auto`} disabled={busy} onClick={() => void actions.setResolved(thread.id, true)}>
              Resolve
            </button>
          </>
        )}
      </div>
    </div>
  );
}
