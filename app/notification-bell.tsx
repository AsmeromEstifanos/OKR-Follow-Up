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

export default function NotificationBell({ userEmail, isAdmin = false }: Props): JSX.Element {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<string>("");
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
    }
    setIsOpen((prev) => !prev);
    setSendResult("");
  }

  async function handleSendReminders(): Promise<void> {
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
                onClick={handleSendReminders}
                disabled={isSending}
                title="Send email reminders to all users with overdue check-ins or at-risk objectives"
              >
                <SendIcon />
                {isSending ? "Sending…" : "Send Reminders"}
              </button>
            )}
          </div>

          {sendResult && <p className="notif-send-result">{sendResult}</p>}

          {count === 0 ? (
            <p className="notif-empty">You are all caught up.</p>
          ) : (
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
        </div>
      )}
    </div>
  );
}
