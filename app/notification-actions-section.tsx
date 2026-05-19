"use client";

import useCurrentUserEmail from "@/app/use-current-user-email";
import { apiPath } from "@/lib/base-path";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type SentItem = { recipient: string; subject: string };

type ReminderLogEntry = {
  occurredAt: string;
  triggeredBy: string;
  emailsSent: number;
  errorCount: number;
  recipients: number;
  sentItems: SentItem[];
};

type ReminderRecipient = {
  email: string;
  name: string;
  summary?: string;
  subject?: string;
  html?: string;
};

type ConfirmStage = "idle" | "loading" | "select" | "sending" | "done";

function SendIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
    </svg>
  );
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export default function NotificationActionsSection(): JSX.Element {
  const userEmail = useCurrentUserEmail();
  const [reminderLog, setReminderLog] = useState<ReminderLogEntry[]>([]);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [isLogLoading, setIsLogLoading] = useState(false);

  const [confirmStage, setConfirmStage] = useState<ConfirmStage>("idle");
  const [previewRecipients, setPreviewRecipients] = useState<ReminderRecipient[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [previewEmail, setPreviewEmail] = useState<string>("");
  const [isEmailPreviewOpen, setIsEmailPreviewOpen] = useState(false);
  const [confirmError, setConfirmError] = useState<string>("");
  const [sendSummary, setSendSummary] = useState<string>("");

  const loadReminderLog = useCallback(async (): Promise<void> => {
    if (!userEmail) return;
    setIsLogLoading(true);
    try {
      const response = await fetch(apiPath("/api/notifications/log"), {
        headers: { "x-user-email": userEmail },
        cache: "no-store"
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { log?: ReminderLogEntry[] };
      setReminderLog(Array.isArray(payload.log) ? payload.log : []);
    } catch {
      // silently ignore
    } finally {
      setIsLogLoading(false);
    }
  }, [userEmail]);

  useEffect(() => {
    void loadReminderLog();
  }, [loadReminderLog]);

  async function openConfirm(): Promise<void> {
    setConfirmStage("loading");
    setConfirmError("");
    setSendSummary("");
    setPreviewRecipients([]);
    setSelectedEmails(new Set());
    setPreviewEmail("");
    setIsEmailPreviewOpen(false);

    try {
      const response = await fetch(apiPath("/api/notifications/remind"), {
        headers: { "x-user-email": userEmail },
        cache: "no-store"
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setConfirmError(payload?.error ?? "Failed to load recipients.");
        setConfirmStage("select");
        return;
      }

      const payload = (await response.json()) as { recipients?: ReminderRecipient[] };
      const recipients = Array.isArray(payload.recipients) ? payload.recipients : [];
      setPreviewRecipients(recipients);
      setSelectedEmails(new Set(recipients.map((r) => r.email)));
      setPreviewEmail(recipients[0]?.email ?? "");
      setConfirmStage("select");
    } catch {
      setConfirmError("Failed to load recipients.");
      setConfirmStage("select");
    }
  }

  function closeConfirm(): void {
    setConfirmStage("idle");
    setConfirmError("");
    setSendSummary("");
    setPreviewRecipients([]);
    setSelectedEmails(new Set());
    setPreviewEmail("");
    setIsEmailPreviewOpen(false);
  }

  function toggleRecipient(email: string): void {
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(email)) {
        next.delete(email);
      } else {
        next.add(email);
      }
      if (!next.has(previewEmail)) {
        setPreviewEmail(next.values().next().value ?? "");
      }
      return next;
    });
  }

  function toggleAllRecipients(): void {
    setSelectedEmails((prev) => {
      const next =
        prev.size === previewRecipients.length
          ? new Set<string>()
          : new Set(previewRecipients.map((r) => r.email));
      setPreviewEmail(next.values().next().value ?? "");
      if (next.size === 0) setIsEmailPreviewOpen(false);
      return next;
    });
  }

  function openEmailPreview(): void {
    const fallbackEmail = selectedEmails.values().next().value ?? "";
    if (!previewEmail || !selectedEmails.has(previewEmail)) {
      setPreviewEmail(fallbackEmail);
    }
    if (fallbackEmail) {
      setIsEmailPreviewOpen(true);
    }
  }

  async function handleConfirmedSend(): Promise<void> {
    const recipients = [...selectedEmails];
    if (recipients.length === 0) return;

    setConfirmStage("sending");
    setConfirmError("");

    try {
      const response = await fetch(apiPath("/api/notifications/remind"), {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-email": userEmail },
        body: JSON.stringify({ recipients })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setConfirmError(payload?.error ?? "Failed to send reminders.");
        setConfirmStage("done");
        return;
      }

      const result = (await response.json()) as {
        sendResult?: { emailsSent?: number; errors?: string[]; notConfigured?: boolean };
        error?: string;
      };

      const send = result.sendResult;
      if (result.error) {
        setConfirmError(result.error);
      } else if (!send || "error" in send) {
        setConfirmError("Reminder run failed.");
      } else if (send.notConfigured) {
        setConfirmError("Email not configured — set NOTIFICATION_FROM_EMAIL in environment.");
      } else {
        const sent = send.emailsSent ?? 0;
        const errorCount = send.errors?.length ?? 0;
        const base = `${sent} reminder email${sent === 1 ? "" : "s"} sent.`;
        setSendSummary(errorCount > 0 ? `${base} ${errorCount} failed to send.` : base);
      }
      void loadReminderLog();
    } catch {
      setConfirmError("Failed to send reminders.");
    } finally {
      setConfirmStage("done");
    }
  }

  const allSelected = previewRecipients.length > 0 && selectedEmails.size === previewRecipients.length;
  const selectedPreviewRecipients = previewRecipients.filter((r) => selectedEmails.has(r.email));
  const activePreview =
    selectedPreviewRecipients.find((r) => r.email === previewEmail) ?? selectedPreviewRecipients[0];

  return (
    <div className="notif-actions">
      <div className="notif-actions-head">
        <h3 className="config-option-title">Reminder dispatch</h3>
        <button
          type="button"
          className="btn"
          onClick={() => void openConfirm()}
          disabled={confirmStage !== "idle"}
        >
          <SendIcon />
          <span style={{ marginLeft: "0.4rem" }}>Send Reminders Now</span>
        </button>
      </div>
      <p className="meta">
        Manually dispatch the same reminder emails the scheduler would send for every enabled rule,
        regardless of schedule. You pick the recipients in the next step.
      </p>

      <div className="notif-actions-log">
        <div className="notif-log-heading">Reminder email log</div>
        {isLogLoading ? (
          <div className="notif-log-loading">
            <span className="notif-log-spinner" aria-hidden="true" />
            Loading log…
          </div>
        ) : reminderLog.length === 0 ? (
          <p className="notif-log-empty">No reminder emails sent yet.</p>
        ) : (
          <ul className="notif-log-list">
            {reminderLog.map((entry, index) => {
              const key = `${entry.occurredAt}-${index}`;
              const isExpanded = expandedLog === key;
              return (
                <li key={key} className="notif-log-item">
                  <button
                    type="button"
                    className="notif-log-item-head"
                    onClick={() => setExpandedLog(isExpanded ? null : key)}
                  >
                    <span className="notif-log-time">{formatTimestamp(entry.occurredAt)}</span>
                    <span className="notif-log-summary">
                      {entry.emailsSent} email{entry.emailsSent !== 1 ? "s" : ""} sent
                      {entry.errorCount > 0 ? ` · ${entry.errorCount} failed` : ""}
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="notif-log-detail">
                      <div className="notif-log-meta">
                        Triggered by {entry.triggeredBy === "scheduler" ? "scheduled job" : entry.triggeredBy}
                      </div>
                      {entry.sentItems.length === 0 ? (
                        <div className="notif-log-meta">No recipient details recorded.</div>
                      ) : (
                        <ul className="notif-log-recipients">
                          {entry.sentItems.map((item, i) => (
                            <li key={i}>
                              <span className="notif-log-recipient">{item.recipient}</span>
                              <span className="notif-log-subject">{item.subject}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {confirmStage !== "idle" && createPortal(
        <div className="notif-confirm-overlay" role="dialog" aria-modal="true">
          <div className={`notif-confirm-card${isEmailPreviewOpen ? " notif-confirm-card-preview" : ""}`}>
            {confirmStage === "loading" && (
              <div className="notif-confirm-loading">
                <span className="notif-log-spinner" aria-hidden="true" />
                Loading recipients…
              </div>
            )}

            {confirmStage === "select" && (
              <>
                <div className="notif-confirm-title">Send reminder emails</div>
                {confirmError ? (
                  <p className="notif-confirm-error">{confirmError}</p>
                ) : previewRecipients.length === 0 ? (
                  <p className="notif-confirm-empty">No one needs a reminder right now.</p>
                ) : isEmailPreviewOpen && activePreview ? (
                  <div className="notif-email-preview">
                    <div className="notif-email-preview-toolbar">
                      <label>
                        Recipient
                        <select
                          value={activePreview.email}
                          onChange={(e) => setPreviewEmail(e.target.value)}
                        >
                          {selectedPreviewRecipients.map((r) => (
                            <option key={r.email} value={r.email}>
                              {r.name || r.email}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="notif-email-preview-subject">
                      <span>Subject</span>
                      <strong>{activePreview.subject ?? ""}</strong>
                    </div>
                    <iframe
                      className="notif-email-preview-frame"
                      title={`Reminder email preview for ${activePreview.name || activePreview.email}`}
                      sandbox=""
                      srcDoc={activePreview.html ?? ""}
                    />
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      className="notif-confirm-selectall"
                      onClick={toggleAllRecipients}
                    >
                      {allSelected ? "Clear all" : "Select all"}
                    </button>
                    <ul className="notif-confirm-recipients">
                      {previewRecipients.map((recipient) => (
                        <li key={recipient.email}>
                          <label className="notif-confirm-recipient">
                            <input
                              type="checkbox"
                              checked={selectedEmails.has(recipient.email)}
                              onChange={() => toggleRecipient(recipient.email)}
                            />
                            <span className="notif-confirm-recipient-name" title={recipient.email}>
                              {recipient.name || recipient.email}
                            </span>
                            {recipient.summary ? (
                              <span className="notif-confirm-recipient-summary">{recipient.summary}</span>
                            ) : null}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <div className="notif-confirm-actions">
                  {isEmailPreviewOpen ? (
                    <button type="button" className="notif-confirm-cancel" onClick={() => setIsEmailPreviewOpen(false)}>
                      Back
                    </button>
                  ) : (
                    <button type="button" className="notif-confirm-cancel" onClick={closeConfirm}>
                      {previewRecipients.length === 0 ? "Close" : "Cancel"}
                    </button>
                  )}
                  {!isEmailPreviewOpen && previewRecipients.length > 0 && (
                    <button
                      type="button"
                      className="notif-confirm-preview-btn"
                      onClick={openEmailPreview}
                      disabled={selectedEmails.size === 0}
                    >
                      Preview
                    </button>
                  )}
                  {isEmailPreviewOpen && (
                    <button type="button" className="notif-confirm-cancel" onClick={closeConfirm}>
                      Cancel
                    </button>
                  )}
                  {previewRecipients.length > 0 && (
                    <button
                      type="button"
                      className="notif-confirm-send"
                      onClick={() => void handleConfirmedSend()}
                      disabled={selectedEmails.size === 0}
                    >
                      Send to {selectedEmails.size}
                    </button>
                  )}
                </div>
              </>
            )}

            {confirmStage === "sending" && (
              <div className="notif-confirm-loading">
                <span className="notif-log-spinner" aria-hidden="true" />
                Sending {selectedEmails.size} reminder email{selectedEmails.size === 1 ? "" : "s"}…
              </div>
            )}

            {confirmStage === "done" && (
              <>
                <div className="notif-confirm-title">
                  {confirmError ? "Couldn't send reminders" : "Reminders sent"}
                </div>
                {confirmError ? (
                  <p className="notif-confirm-error">{confirmError}</p>
                ) : (
                  <p className="notif-confirm-done">{sendSummary}</p>
                )}
                <div className="notif-confirm-actions">
                  <button type="button" className="notif-confirm-send" onClick={closeConfirm}>
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
