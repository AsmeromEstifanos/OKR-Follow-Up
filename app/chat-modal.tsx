"use client";

import type { Comment } from "@/lib/types";
import { apiPath } from "@/lib/base-path";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type Props = {
  entityType: "objective" | "kr";
  entityKey: string;
  title: string;
  currentUserEmail: string;
  onClose: () => void;
  onCommentsLoaded: (comments: Comment[]) => void;
};

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatModal({
  entityType,
  entityKey,
  title,
  currentUserEmail,
  onClose,
  onCommentsLoaded
}: Props): JSX.Element {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadComments = useCallback(async (): Promise<void> => {
    const url = apiPath(
      `/api/comments?entityType=${encodeURIComponent(entityType)}&entityKey=${encodeURIComponent(entityKey)}`
    );
    const response = await fetch(url, { cache: "no-store" });
    if (response.ok) {
      const loaded = (await response.json()) as Comment[];
      setComments(loaded);
      onCommentsLoaded(loaded);
    }
    setIsLoading(false);
  }, [entityType, entityKey, onCommentsLoaded]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [isLoading]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
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
        throw new Error(payload.error ?? "Failed to post.");
      }

      const created = (await response.json()) as Comment;
      const next = [...comments, created];
      setComments(next);
      onCommentsLoaded(next);
      setBody("");
      inputRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post comment.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(commentKey: string): Promise<void> {
    const response = await fetch(
      apiPath(`/api/comments/${encodeURIComponent(commentKey)}`),
      { method: "DELETE" }
    );
    if (response.ok) {
      const next = comments.filter((c) => c.commentKey !== commentKey);
      setComments(next);
      onCommentsLoaded(next);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const form = e.currentTarget.closest("form");
      form?.requestSubmit();
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="chat-overlay" onClick={onClose} aria-hidden="true" />

      {/* Modal */}
      <div className="chat-modal" role="dialog" aria-modal="true" aria-label={`Discussion: ${title}`}>
        {/* Header */}
        <div className="chat-modal-header">
          <div className="chat-modal-title-wrap">
            <span className="chat-modal-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
              </svg>
            </span>
            <div>
              <div className="chat-modal-label">Discussion</div>
              <div className="chat-modal-title">{title}</div>
            </div>
          </div>
          <button type="button" className="chat-close-btn" onClick={onClose} aria-label="Close discussion">
            ✕
          </button>
        </div>

        {/* Messages */}
        <div className="chat-messages">
          {isLoading ? (
            <p className="chat-empty">Loading…</p>
          ) : comments.length === 0 ? (
            <p className="chat-empty">No messages yet. Start the conversation!</p>
          ) : (
            <>
              {comments.map((comment) => {
                const isOwn = comment.authorEmail.toLowerCase() === currentUserEmail.toLowerCase();
                return (
                  <div
                    key={comment.commentKey}
                    className={`chat-msg ${isOwn ? "chat-msg-own" : "chat-msg-other"}`}
                  >
                    {!isOwn && (
                      <div className="chat-avatar" aria-hidden="true">
                        {getInitials(comment.authorName || comment.authorEmail)}
                      </div>
                    )}
                    <div className="chat-msg-content">
                      {!isOwn && (
                        <span className="chat-msg-author">{comment.authorName || comment.authorEmail}</span>
                      )}
                      <div className="chat-bubble">
                        <p className="chat-bubble-text">{comment.body}</p>
                        <div className="chat-bubble-meta">
                          <span className="chat-msg-time">{formatTime(comment.createdAt)}</span>
                          {isOwn && (
                            <button
                              type="button"
                              className="chat-delete-btn"
                              onClick={() => handleDelete(comment.commentKey)}
                              aria-label="Delete message"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    {isOwn && (
                      <div className="chat-avatar chat-avatar-own" aria-hidden="true">
                        {getInitials(comment.authorName || comment.authorEmail)}
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Input */}
        <form className="chat-input-area" onSubmit={handleSubmit}>
          <textarea
            ref={inputRef}
            className="chat-input"
            placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSubmitting || !currentUserEmail}
          />
          {error && <p className="chat-input-error">{error}</p>}
          <button
            type="submit"
            className="chat-send-btn"
            disabled={isSubmitting || !body.trim() || !currentUserEmail}
            aria-label="Send message"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </form>
      </div>
    </>
  );
}
