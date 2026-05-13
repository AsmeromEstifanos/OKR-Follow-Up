"use client";

import { apiPath, withBasePath } from "@/lib/base-path";
import React, { FormEvent, useEffect, useRef, useState } from "react";

type Role = "user" | "assistant";
type Message = { role: Role; content: string; id: string };
type Props = { userEmail?: string; userName?: string };
type EmailRecipient = { name: string; email: string };
type EmailAction = { recipients: EmailRecipient[]; subject: string; body: string };

let msgIdCounter = 0;
function newId(): string {
  return `msg-${++msgIdCounter}`;
}

function SparkleIcon(): JSX.Element {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" />
    </svg>
  );
}

function SendIcon(): JSX.Element {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

function TypingDots(): JSX.Element {
  return (
    <div className="ai-chat-typing" aria-label="AI is thinking">
      <span /><span /><span />
    </div>
  );
}

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

function MarkdownContent({ text }: { text: string }): JSX.Element {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = (): void => {
    if (listItems.length > 0) {
      nodes.push(
        <ul key={`ul-${nodes.length}`} className="ai-md-list">
          {listItems.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("#### ")) {
      flushList();
      nodes.push(<p key={i} className="ai-md-h4">{renderInline(line.slice(5))}</p>);
    } else if (line.startsWith("### ")) {
      flushList();
      nodes.push(<p key={i} className="ai-md-h3">{renderInline(line.slice(4))}</p>);
    } else if (line.startsWith("## ")) {
      flushList();
      nodes.push(<p key={i} className="ai-md-h2">{renderInline(line.slice(3))}</p>);
    } else if (line.startsWith("- ") || line.startsWith("• ")) {
      listItems.push(line.slice(2));
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      nodes.push(<p key={i} className="ai-md-p">{renderInline(line)}</p>);
    }
  }

  flushList();
  return <div className="ai-md-body">{nodes}</div>;
}

function parseEmailAction(content: string): { text: string; action: EmailAction | null } {
  const startIdx = content.indexOf("[SEND_EMAILS]");
  if (startIdx === -1) return { text: content, action: null };

  const endIdx = content.indexOf("[/SEND_EMAILS]", startIdx);
  if (endIdx === -1) {
    // Block is still streaming — hide the partial marker
    return { text: content.slice(0, startIdx).trim(), action: null };
  }

  const jsonStr = content.slice(startIdx + "[SEND_EMAILS]".length, endIdx).trim();
  const textBefore = content.slice(0, startIdx).trim();
  try {
    return { text: textBefore, action: JSON.parse(jsonStr) as EmailAction };
  } catch {
    return { text: textBefore, action: null };
  }
}

function makeWelcome(userName?: string): Message {
  const greeting = userName ? `Hi ${userName.split(" ")[0]}!` : "Hi!";
  return {
    role: "assistant",
    id: "welcome",
    content: `${greeting} I'm your OKR assistant. Ask me anything about your objectives, key results, progress, blockers, or team performance.`
  };
}

const STORAGE_KEY = "okr-ai-chat-history";

function loadStoredMessages(fallback: Message[]): Message[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as Message[];
    }
  } catch {
    // ignore
  }
  return fallback;
}

export default function AiGlobalChat({ userEmail, userName }: Props): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() =>
    loadStoredMessages([makeWelcome(userName)])
  );
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [dismissedEmailIds, setDismissedEmailIds] = useState<Set<string>>(new Set());
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // ignore storage errors
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      inputRef.current?.focus();
    }
  }, [isOpen, messages]);

  async function sendMessage(e?: FormEvent): Promise<void> {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: "user", content: text, id: newId() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(apiPath("/api/ai/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userEmail,
          userName,
          messages: next
            .filter((m) => m.id !== "welcome")
            .map(({ role, content }) => ({ role, content }))
        })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "AI request failed.");
      }

      const assistantId = newId();
      setMessages((prev) => [...prev, { role: "assistant", content: "", id: assistantId }]);
      setIsLoading(false);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + chunk } : m))
          );
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  function handleClear(): void {
    setMessages([makeWelcome(userName)]);
    setError("");
    setInput("");
    setDismissedEmailIds(new Set());
  }

  async function handleEmailSend(msgId: string, action: EmailAction): Promise<void> {
    setSendingEmailId(msgId);
    try {
      const res = await fetch(apiPath("/api/ai/send-emails"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderEmail: userEmail,
          senderName: userName,
          recipients: action.recipients,
          subject: action.subject,
          body: action.body
        })
      });
      const result = (await res.json()) as { sent?: number; errors?: string[]; error?: string };
      setDismissedEmailIds((prev) => new Set([...prev, msgId]));
      const confirmText =
        result.error
          ? `Could not send emails: ${result.error}`
          : result.errors?.length
          ? `Sent to ${result.sent ?? 0} recipient(s). Some failed: ${result.errors.join("; ")}`
          : `Done! Emails sent to ${result.sent ?? 0} recipient(s). They should arrive shortly.`;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: confirmText, id: newId() }
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Failed to send emails: ${err instanceof Error ? err.message : "Unknown error"}`,
          id: newId()
        }
      ]);
    } finally {
      setSendingEmailId(null);
    }
  }

  function handleEmailDismiss(msgId: string): void {
    setDismissedEmailIds((prev) => new Set([...prev, msgId]));
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "No problem — let me know if you'd like to make any changes.", id: newId() }
    ]);
  }

  return (
    <div className="ai-fab-wrap">
      {/* Expanded panel */}
      {isOpen && (
        <div className="ai-fab-panel" role="dialog" aria-label="OKR AI Assistant">
          <div className="ai-fab-header">
            <div className="ai-fab-header-left">
              <span className="ai-fab-header-icon" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={withBasePath("/svh.gif")} alt="" className="ai-fab-header-gif" />
              </span>
              <div>
                <div className="ai-fab-title">OKR Assistant</div>
                <div className="ai-fab-subtitle">Ask anything about your OKRs</div>
              </div>
            </div>
            <div className="ai-fab-header-actions">
              <button type="button" className="ai-fab-action-btn" onClick={handleClear} title="Clear conversation">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                </svg>
              </button>
              <button type="button" className="ai-fab-action-btn" onClick={() => setIsOpen(false)} aria-label="Close">
                ✕
              </button>
            </div>
          </div>

          <div className="ai-fab-messages">
            {messages.map((msg) => {
              const { text, action } =
                msg.role === "assistant" ? parseEmailAction(msg.content) : { text: msg.content, action: null };
              const showAction = action !== null && !dismissedEmailIds.has(msg.id);

              return (
                <div key={msg.id} className={`ai-fab-msg ${msg.role === "user" ? "ai-fab-msg-user" : "ai-fab-msg-ai"}`}>
                  {msg.role === "assistant" && (
                    <span className="ai-fab-msg-avatar" aria-hidden="true">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={withBasePath("/svh.gif")} alt="" className="ai-fab-avatar-gif" />
                    </span>
                  )}
                  {msg.role === "user" ? (
                    <div className="ai-fab-bubble">
                      <p className="ai-fab-bubble-text">{msg.content}</p>
                    </div>
                  ) : (
                  <div className="ai-fab-bubble-wrap">
                    <div className="ai-fab-bubble">
                      <MarkdownContent text={text} />
                    </div>
                    {showAction && (
                      <div className="ai-email-confirm-card">
                        <div className="ai-email-confirm-meta">
                          <span className="ai-email-confirm-icon">✉️</span>
                          <div>
                            <div className="ai-email-confirm-subject">{action.subject}</div>
                            <div className="ai-email-confirm-to">
                              To: {action.recipients.map((r) => r.name || r.email).join(", ")}
                            </div>
                          </div>
                        </div>
                        <div className="ai-email-confirm-actions">
                          <button
                            type="button"
                            className="btn ai-email-send-btn"
                            disabled={sendingEmailId === msg.id}
                            onClick={() => void handleEmailSend(msg.id, action)}
                          >
                            {sendingEmailId === msg.id ? "Sending…" : "Confirm & Send"}
                          </button>
                          <button
                            type="button"
                            className="tab-btn"
                            disabled={sendingEmailId === msg.id}
                            onClick={() => handleEmailDismiss(msg.id)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  )}
                </div>
              );
            })}

            {isLoading && (
              <div className="ai-fab-msg ai-fab-msg-ai">
                <span className="ai-fab-msg-avatar" aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={withBasePath("/svh.gif")} alt="" className="ai-fab-avatar-gif" />
                </span>
                <div className="ai-fab-bubble">
                  <TypingDots />
                </div>
              </div>
            )}

            {error && (
              <p className="ai-fab-error">{error}</p>
            )}

            <div ref={bottomRef} />
          </div>

          <form className="ai-fab-input-row" onSubmit={sendMessage}>
            <textarea
              ref={inputRef}
              className="ai-fab-input"
              placeholder="Ask about your OKRs…"
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
            />
            <button
              type="submit"
              className="ai-fab-send"
              disabled={!input.trim() || isLoading}
              aria-label="Send"
            >
              <SendIcon />
            </button>
          </form>
        </div>
      )}

      {/* FAB button with spinning gradient ring */}
      <div className={`ai-fab-ring-wrap ${isOpen ? "ai-fab-ring-wrap-open" : ""}`}>
        <div className="ai-fab-ring" aria-hidden="true" />
        <button
          type="button"
          className="ai-fab-btn"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-label={isOpen ? "Close OKR assistant" : "Open OKR assistant"}
          title="OKR AI Assistant"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={withBasePath("/svh.gif")} alt="" aria-hidden="true" className="ai-fab-gif" />
        </button>
      </div>
    </div>
  );
}
