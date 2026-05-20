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

// Render a comment body with @mentions highlighted.
// Mentions are stored as @[Display Name] in the body text.
// Legacy plain @Name tokens (no brackets) are also highlighted if the name
// appears in knownNames (fallback for older messages).
function renderBody(text: string, knownNames: Set<string>): JSX.Element {
  // Split on bracketed mentions first: @[Display Name]
  const parts = text.split(/(@\[[^\]]+\])/g);
  const nodes: JSX.Element[] = [];

  parts.forEach((part, i) => {
    if (part.startsWith("@[") && part.endsWith("]")) {
      const name = part.slice(2, -1);
      nodes.push(<span key={i} className="chat-mention">@{name}</span>);
      return;
    }
    // Fallback: highlight plain @Name tokens that are in knownNames
    if (knownNames.size === 0) {
      nodes.push(<span key={i}>{part}</span>);
      return;
    }
    const escaped = [...knownNames]
      .sort((a, b) => b.length - a.length)
      .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const legacyPattern = new RegExp(`(@(?:${escaped.join("|")}))`, "g");
    const subParts = part.split(legacyPattern);
    subParts.forEach((sub, j) => {
      if (sub.startsWith("@") && knownNames.has(sub.slice(1))) {
        nodes.push(<span key={`${i}-${j}`} className="chat-mention">{sub}</span>);
      } else {
        nodes.push(<span key={`${i}-${j}`}>{sub}</span>);
      }
    });
  });

  return <>{nodes}</>;
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
  // Use refs so handleSubmit always reads the latest value without closure staleness
  const mentionedEmailsRef = useRef<string[]>([]);
  const mentionedNamesRef = useRef<Set<string>>(new Set());
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
      // Seed knownNames from bracketed @[Name] tokens in loaded bodies (for legacy fallback highlighting)
      loaded.forEach((c) => {
        (c.body.match(/@\[([^\]]+)\]/g) ?? []).forEach((t) =>
          mentionedNamesRef.current.add(t.slice(2, -1))
        );
      });
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
    const token = `@[${user.displayName}] `;
    const next = before + token + after;
    setBody(next);
    const email = user.mail || user.principalName;
    if (email && !mentionedEmailsRef.current.includes(email)) {
      mentionedEmailsRef.current = [...mentionedEmailsRef.current, email];
    }
    mentionedNamesRef.current.add(user.displayName);
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
      // Resolve manually typed @mentions not already in the ref (dropdown fills the ref automatically).
      // Bracketed format @[Name] is from dropdown; plain @word is manual typing.
      const tokens = [...new Set((body.match(/@(\S+)/g) ?? []).map((t) => t.slice(1).replace(/^\[|\]$/g, "").split(/\s+/)[0].toLowerCase()))];
      if (tokens.length > 0) {
        const results = await Promise.allSettled(
          tokens.map((token) =>
            fetch(apiPath(`/api/users/suggest?q=${encodeURIComponent(token)}`))
              .then((r) => (r.ok ? (r.json() as Promise<UserSuggestion[]>) : []))
              .catch(() => [] as UserSuggestion[])
          )
        );
        results.forEach((result) => {
          if (result.status === "fulfilled") {
            result.value.forEach((user) => {
              const email = user.mail || user.principalName;
              if (email && !mentionedEmailsRef.current.includes(email)) {
                mentionedEmailsRef.current = [...mentionedEmailsRef.current, email];
              }
            });
          }
        });
      }

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
          mentionedEmails: mentionedEmailsRef.current
        })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Failed to post.");
      }

      const created = (await response.json()) as Comment & { _mentionDebug?: string };
      const next = [...comments, created];
      setComments(next);
      onCommentsLoaded(next);
      setBody("");
      mentionedEmailsRef.current = [];
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
                        <p className="chat-bubble-text">{renderBody(comment.body, mentionedNamesRef.current)}</p>
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
