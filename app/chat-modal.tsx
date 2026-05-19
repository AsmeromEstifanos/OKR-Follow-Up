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

type UserSuggestion = {
  displayName: string;
  principalName: string;
  mail: string;
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

// Render a comment body with @mentions highlighted
function renderBody(text: string): JSX.Element {
  // Match @word or @"multi word" patterns
  const parts = text.split(/(@\S+)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("@") ? (
          <span key={i} className="chat-mention">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
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

  // @mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<UserSuggestion[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState(0);
  // Track emails of all users mentioned in the current draft
  const [mentionedEmails, setMentionedEmails] = useState<string[]>([]);
  const mentionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (e.key === "Escape") {
        if (mentionQuery !== null) {
          setMentionQuery(null);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, mentionQuery]);

  // Fetch suggestions when mentionQuery changes
  useEffect(() => {
    if (mentionQuery === null) {
      setMentionSuggestions([]);
      return;
    }

    if (mentionDebounceRef.current) clearTimeout(mentionDebounceRef.current);
    mentionDebounceRef.current = setTimeout(async () => {
      try {
        const url = apiPath(`/api/users/suggest?q=${encodeURIComponent(mentionQuery)}`);
        const res = await fetch(url);
        if (res.ok) {
          const users = (await res.json()) as UserSuggestion[];
          setMentionSuggestions(users.slice(0, 8));
          setMentionIndex(0);
        }
      } catch {
        setMentionSuggestions([]);
      }
    }, 150);
  }, [mentionQuery]);

  function detectMention(value: string, cursor: number): void {
    const before = value.slice(0, cursor);
    const match = /@(\S*)$/.exec(before);
    if (match) {
      setMentionQuery(match[1]);
      setMentionStart(match.index);
    } else {
      setMentionQuery(null);
    }
  }

  function insertMention(user: UserSuggestion): void {
    const cursor = inputRef.current?.selectionStart ?? body.length;
    const before = body.slice(0, mentionStart);
    const after = body.slice(cursor);
    // Use @firstname (first word of displayName) in the body so it reads naturally
    const firstName = user.displayName.split(/\s+/)[0] ?? user.displayName;
    const token = `@${firstName} `;
    const next = before + token + after;
    setBody(next);
    setMentionedEmails((prev) => {
      const email = user.mail || user.principalName;
      return prev.includes(email) ? prev : [...prev, email];
    });
    setMentionQuery(null);
    setMentionSuggestions([]);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      const pos = before.length + token.length;
      inputRef.current?.setSelectionRange(pos, pos);
    });
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>): void {
    const value = e.target.value;
    setBody(value);
    detectMention(value, e.target.selectionStart);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!body.trim() || !currentUserEmail) return;
    if (mentionQuery !== null && mentionSuggestions.length > 0) return;

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
          body: body.trim(),
          entityTitle: title,
          mentionedEmails: mentionedEmails.filter((e) => e !== currentUserEmail)
        })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Failed to post.");
      }

      const created = (await response.json()) as Comment & { mentionError?: string };
      if (created.mentionError) {
        console.warn("[mention-notify]", created.mentionError);
        setError(`Message posted, but mention notification failed: ${created.mentionError}`);
      }
      const next = [...comments, created];
      setComments(next);
      onCommentsLoaded(next);
      setBody("");
      setMentionedEmails([]);
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
    if (mentionQuery !== null && mentionSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionSuggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + mentionSuggestions.length) % mentionSuggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(mentionSuggestions[mentionIndex]);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const form = e.currentTarget.closest("form");
      form?.requestSubmit();
    }
  }

  const showMentionDropdown = mentionQuery !== null && mentionSuggestions.length > 0;

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
                        <p className="chat-bubble-text">{renderBody(comment.body)}</p>
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
          <div className="chat-input-wrap">
            {showMentionDropdown && (
              <ul
                className="mention-dropdown"
                role="listbox"
                aria-label="User suggestions"
              >
                {mentionSuggestions.map((user, i) => (
                  <li
                    key={user.principalName}
                    role="option"
                    aria-selected={i === mentionIndex}
                    className={`mention-option${i === mentionIndex ? " mention-option-active" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertMention(user);
                    }}
                  >
                    <span className="mention-avatar">{getInitials(user.displayName)}</span>
                    <span className="mention-info">
                      <span className="mention-name">{user.displayName}</span>
                      <span className="mention-email">{user.mail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <textarea
              ref={inputRef}
              className="chat-input"
              placeholder="Type a message… (@ to mention, Enter to send)"
              rows={2}
              value={body}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              disabled={isSubmitting || !currentUserEmail}
              aria-autocomplete="list"
              aria-expanded={showMentionDropdown}
            />
          </div>
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
