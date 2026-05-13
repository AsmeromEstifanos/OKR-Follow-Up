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

function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split("|").map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|") || !trimmed.includes("-")) return false;
  const cells = splitTableRow(trimmed);
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell));
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

    const isPotentialRow = line.trim().startsWith("|") && line.includes("|");
    if (isPotentialRow && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushList();
      const header = splitTableRow(line);
      const bodyRows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].trim().startsWith("|") && lines[j].includes("|")) {
        bodyRows.push(splitTableRow(lines[j]));
        j++;
      }
      nodes.push(
        <div key={`tbl-${i}`} className="ai-md-table-wrap">
          <table className="ai-md-table">
            <thead>
              <tr>
                {header.map((cell, idx) => (
                  <th key={idx}>{renderInline(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, rIdx) => (
                <tr key={rIdx}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx}>{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      i = j - 1;
      continue;
    }

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

function parseOptions(content: string): { text: string; options: string[] | null } {
  const startIdx = content.indexOf("[OPTIONS]");
  if (startIdx === -1) return { text: content, options: null };

  const endIdx = content.indexOf("[/OPTIONS]", startIdx);
  if (endIdx === -1) {
    return { text: content.slice(0, startIdx).trim(), options: null };
  }

  const optionsStr = content.slice(startIdx + "[OPTIONS]".length, endIdx).trim();
  const textBefore = content.slice(0, startIdx).trim();
  const options = optionsStr
    .split("|")
    .map((o) => o.trim())
    .filter(Boolean);
  return { text: textBefore, options: options.length > 0 ? options : null };
}

function parseAssistantContent(content: string): {
  text: string;
  action: EmailAction | null;
  options: string[] | null;
} {
  const { text: t1, action } = parseEmailAction(content);
  const { text: t2, options } = parseOptions(t1);
  return { text: t2, action, options };
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

  async function sendMessage(e?: FormEvent, override?: string): Promise<void> {
    e?.preventDefault();
    const text = (override ?? input).trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: "user", content: text, id: newId() };
    const next = [...messages, userMsg];
    setMessages(next);
    if (override === undefined) setInput("");
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

  function handleEmailSend(msgId: string, action: EmailAction): void {
    const to = action.recipients
      .map((r) => r.email)
      .filter((email) => email && email.includes("@"))
      .join(",");

    if (!to) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "No valid recipient emails to open.", id: newId() }
      ]);
      return;
    }

    const subject = encodeURIComponent(action.subject);
    const body = encodeURIComponent(action.body);
    const mailto = `mailto:${to}?subject=${subject}&body=${body}`;

    window.location.href = mailto;

    setDismissedEmailIds((prev) => new Set([...prev, msgId]));
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: `Opened your email client with a draft to ${action.recipients.length} recipient${action.recipients.length === 1 ? "" : "s"}. Review and click Send in Outlook to dispatch.`,
        id: newId()
      }
    ]);
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
            {messages.map((msg, msgIdx) => {
              const { text, action, options } =
                msg.role === "assistant"
                  ? parseAssistantContent(msg.content)
                  : { text: msg.content, action: null, options: null };
              const showAction = action !== null && !dismissedEmailIds.has(msg.id);
              const isLastMessage = msgIdx === messages.length - 1;
              const showOptions = options !== null && isLastMessage && !isLoading;

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
                            onClick={() => handleEmailSend(msg.id, action)}
                          >
                            Open in Outlook
                          </button>
                          <button
                            type="button"
                            className="tab-btn"
                            onClick={() => handleEmailDismiss(msg.id)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    {showOptions && options && (
                      <div className="ai-options-row">
                        {options.map((opt, oIdx) => (
                          <button
                            key={oIdx}
                            type="button"
                            className="ai-option-btn"
                            onClick={() => void sendMessage(undefined, opt)}
                          >
                            {opt}
                          </button>
                        ))}
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
