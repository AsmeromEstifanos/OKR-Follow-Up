"use client";

import type { Comment } from "@/lib/types";
import { apiPath } from "@/lib/base-path";
import useCurrentUserEmail from "@/app/use-current-user-email";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type Props = {
  entityType: "objective" | "kr";
  entityKey: string;
};

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

export default function CommentSection({ entityType, entityKey }: Props): JSX.Element {
  const currentUserEmail = useCurrentUserEmail();
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadComments = useCallback(async (): Promise<void> => {
    const url = apiPath(`/api/comments?entityType=${encodeURIComponent(entityType)}&entityKey=${encodeURIComponent(entityKey)}`);
    const response = await fetch(url, { cache: "no-store" });
    if (response.ok) {
      setComments((await response.json()) as Comment[]);
    }
    setIsLoading(false);
  }, [entityType, entityKey]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!body.trim() || !currentUserEmail) return;

    setIsSubmitting(true);
    setError("");

    try {
      const displayName = currentUserEmail.split("@")[0] ?? currentUserEmail;
      const response = await fetch(apiPath("/api/comments"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          entityKey,
          authorEmail: currentUserEmail,
          authorName: displayName,
          body: body.trim()
        })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Failed to post comment.");
      }

      const created = (await response.json()) as Comment;
      setComments((prev) => [...prev, created]);
      setBody("");
      textareaRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post comment.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(commentKey: string): Promise<void> {
    const response = await fetch(apiPath(`/api/comments/${encodeURIComponent(commentKey)}`), {
      method: "DELETE"
    });

    if (response.ok) {
      setComments((prev) => prev.filter((c) => c.commentKey !== commentKey));
    }
  }

  return (
    <section className="comment-section">
      <h2 className="comment-section-title">Discussion</h2>

      {isLoading ? (
        <p className="comment-empty">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="comment-empty">No comments yet. Be the first to add one.</p>
      ) : (
        <ul className="comment-list">
          {comments.map((comment) => (
            <li key={comment.commentKey} className="comment-item">
              <div className="comment-avatar" aria-hidden="true">
                {getInitials(comment.authorName || comment.authorEmail)}
              </div>
              <div className="comment-bubble">
                <div className="comment-meta">
                  <span className="comment-author">{comment.authorName || comment.authorEmail}</span>
                  <span className="comment-time">{formatRelativeTime(comment.createdAt)}</span>
                </div>
                <p className="comment-body">{comment.body}</p>
                {currentUserEmail && currentUserEmail.toLowerCase() === comment.authorEmail.toLowerCase() && (
                  <button
                    type="button"
                    className="comment-delete-btn"
                    onClick={() => handleDelete(comment.commentKey)}
                    aria-label="Delete comment"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {currentUserEmail ? (
        <form className="comment-form" onSubmit={handleSubmit}>
          <textarea
            ref={textareaRef}
            className="comment-input"
            placeholder="Add a comment…"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={isSubmitting}
          />
          {error && <p className="comment-error">{error}</p>}
          <div className="comment-form-footer">
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting || !body.trim()}
            >
              {isSubmitting ? "Posting…" : "Post comment"}
            </button>
          </div>
        </form>
      ) : (
        <p className="comment-empty">Sign in to post a comment.</p>
      )}
    </section>
  );
}
