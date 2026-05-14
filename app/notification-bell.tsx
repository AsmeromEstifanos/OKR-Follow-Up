"use client";

import type { DashboardMe, KeyResult, Objective } from "@/lib/types";
import { apiPath } from "@/lib/base-path";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  userEmail: string;
  isAdmin?: boolean;
};

type NotificationItem =
  | { kind: "missing-checkin"; kr: KeyResult }
  | { kind: "at-risk"; objective: Objective };

type SentItem = { recipient: string; subject: string };

type ReminderLogEntry = {
  occurredAt: string;
  triggeredBy: string;
  emailsSent: number;
  errorCount: number;
  recipients: number;
  sentItems: SentItem[];
};

function BellIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6V11a6 6 0 0 0-5-5.91V4a1 1 0 1 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1l-2-2z" />
    </svg>
  );
}

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

export default function NotificationBell({ userEmail, isAdmin = false }: Props): JSX.Element {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<string>("");
  const [reminderLog, setReminderLog] = useState<ReminderLogEntry[]>([]);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  const loadNotifications = useCallback(async (): Promise<void> => {
    if (!userEmail) return;

    try {
      const url = apiPath(`/api/dashboard/me?owner=${encodeURIComponent(userEmail)}`);
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) return;

      const dashboard = (await response.json()) as DashboardMe;
      const items: NotificationItem[] = [
        ...dashboard.missingCheckIns.map((kr): NotificationItem => ({ kind: "missing-checkin", kr })),
        ...dashboard.atRiskObjectives.map((obj): NotificationItem => ({ kind: "at-risk", objective: obj }))
      ];
      setNotifications(items);
    } catch {
      // silently ignore
    }
  }, [userEmail]);

  const loadReminderLog = useCallback(async (): Promise<void> => {
    if (!userEmail || !isAdmin) return;

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
    }
  }, [userEmail, isAdmin]);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  function handleBellClick(): void {
    if (!isOpen && bellRef.current) {
      const rect = bellRef.current.getBoundingClientRect();
      setPanelPos({ top: rect.bottom + 8, left: rect.left });
      void loadReminderLog();
    }
    setIsOpen((prev) => !prev);
    setSendResult("");
  }

  async function handleSendReminders(): Promise<void> {
    setShowConfirm(false);
    setIsSending(true);
    setSendResult("");

    try {
      const response = await fetch(apiPath("/api/notifications/remind"), {
        method: "POST",
        headers: { "x-user-email": userEmail }
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setSendResult(payload.error ?? "Failed to send reminders.");
        return;
      }

      const result = (await response.json()) as {
        recipients?: number;
        sendResult?: {
          emailsSent?: number;
          skipped?: number;
          errors?: string[];
          notConfigured?: boolean;
        };
        error?: string;
      };

      const send = result.sendResult;
      if (result.error) {
        setSendResult(result.error);
      } else if (!send || "error" in send) {
        setSendResult("Reminder run failed.");
      } else if (send.notConfigured) {
        setSendResult("Email not configured — set NOTIFICATION_FROM_EMAIL in environment.");
      } else {
        const sent = send.emailsSent ?? 0;
        const errorCount = send.errors?.length ?? 0;
        const base = `${sent} email${sent !== 1 ? "s" : ""} sent.`;
        setSendResult(errorCount > 0 ? `${base} ${errorCount} failed.` : base);
      }

      void loadReminderLog();
    } catch {
      setSendResult("Failed to send reminders.");
    } finally {
      setIsSending(false);
    }
  }

  const count = notifications.length;

  return (
    <div className="notif-bell-wrap" ref={panelRef}>
      <button
        ref={bellRef}
        type="button"
        className="notif-bell-btn"
        aria-label={`Notifications${count > 0 ? ` (${count})` : ""}`}
        onClick={handleBellClick}
      >
        <BellIcon />
        {count > 0 && (
          <span className="notif-badge" aria-hidden="true">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {isOpen && panelPos && (
        <div
          className="notif-panel"
          role="dialog"
          aria-label="Notifications"
          style={{ position: "fixed", top: panelPos.top, left: panelPos.left }}
        >
          <div className="notif-panel-header">
            Notifications
            {isAdmin && (
              <button
                type="button"
                className="notif-send-btn"
                onClick={() => setShowConfirm(true)}
                disabled={isSending}
                title="Send the same reminder emails the daily scheduler sends"
              >
                <SendIcon />
                {isSending ? "Sending…" : "Send Reminders"}
              </button>
            )}
          </div>

          {sendResult && <p className="notif-send-result">{sendResult}</p>}

          {count > 0 && (
            <ul className="notif-list">
              {notifications.map((item, index) => {
                if (item.kind === "missing-checkin") {
                  return (
                    <li key={`kr-${item.kr.krKey}-${index}`} className="notif-item">
                      <div className="notif-item-title">Check-in overdue</div>
                      <div className="notif-item-sub">
                        <Link
                          href={`/krs/${item.kr.krKey}/checkin`}
                          className="notif-item-link"
                          onClick={() => setIsOpen(false)}
                        >
                          {item.kr.title}
                        </Link>
                        {" — "}
                        {item.kr.progressPct}% progress
                      </div>
                    </li>
                  );
                }

                return (
                  <li key={`obj-${item.objective.objectiveKey}-${index}`} className="notif-item">
                    <div className="notif-item-title">
                      At-risk objective ({item.objective.rag})
                    </div>
                    <div className="notif-item-sub">
                      <Link
                        href={`/objectives/${item.objective.objectiveKey}`}
                        className="notif-item-link"
                        onClick={() => setIsOpen(false)}
                      >
                        {item.objective.title}
                      </Link>
                      {" — "}
                      {item.objective.progressPct}% progress
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {isAdmin && (
            <div className="notif-log-section">
              <div className="notif-log-heading">Reminder email log</div>
              {reminderLog.length === 0 ? (
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
          )}
        </div>
      )}

      {showConfirm && (
        <div className="notif-confirm-overlay" role="dialog" aria-modal="true">
          <div className="notif-confirm-card">
            <div className="notif-confirm-title">Send reminder emails now?</div>
            <div className="notif-confirm-actions">
              <button
                type="button"
                className="notif-confirm-cancel"
                onClick={() => setShowConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="notif-confirm-send"
                onClick={() => void handleSendReminders()}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
