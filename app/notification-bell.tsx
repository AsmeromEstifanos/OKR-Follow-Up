"use client";

import { getCommentCounts, invalidateCommentCounts } from "@/lib/comment-counts";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  userEmail: string;
};

type UnreadThread = {
  id: string;
  entityType: "objective" | "kr";
  entityKey: string;
  title: string;
  code: string;
  parentObjectiveCode?: string;
  newCount: number;
  latestAt: string;
};

const STORAGE_PREFIX = "okr-chat-last-read";

function lastReadKey(entityType: string, entityKey: string, userEmail: string): string {
  return `${STORAGE_PREFIX}::${entityType}::${entityKey}::${userEmail.toLowerCase()}`;
}

function getLastRead(entityType: string, entityKey: string, userEmail: string): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(lastReadKey(entityType, entityKey, userEmail)) ?? "";
  } catch {
    return "";
  }
}

function entityHref(entityType: string, entityKey: string): string {
  // Next.js <Link> prepends basePath automatically, so we use a plain root-
  // relative path. Passing withBasePath("/") here would double the prefix
  // (e.g. /okr/okr?…).
  const target = encodeURIComponent(`${entityType}::${entityKey}`);
  return `/?openChat=${target}`;
}

function BellIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6V11a6 6 0 0 0-5-5.91V4a1 1 0 1 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1l-2-2z" />
    </svg>
  );
}

function ChatBubbleIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" />
    </svg>
  );
}

export default function NotificationBell({ userEmail }: Props): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [unread, setUnread] = useState<UnreadThread[]>([]);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelContentRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  const loadUnread = useCallback(async (): Promise<void> => {
    if (!userEmail) return;
    const counts = await getCommentCounts();
    const items: UnreadThread[] = [];

    for (const [id, entry] of Object.entries(counts)) {
      if (entry.count === 0 || !entry.entityType || !entry.entityKey) continue;
      const lr = getLastRead(entry.entityType, entry.entityKey, userEmail);
      // Compute exact unread count from timestamps. If lastRead is unset (user
      // never opened the thread), every comment is unread.
      const timestamps = entry.timestamps ?? [];
      const newCount = lr
        ? timestamps.filter((t) => t > lr).length
        : entry.count;
      if (newCount === 0) continue;
      items.push({
        id,
        entityType: entry.entityType,
        entityKey: entry.entityKey,
        title: entry.title ?? entry.entityKey,
        code: entry.code ?? entry.entityKey,
        parentObjectiveCode: entry.parentObjectiveCode,
        newCount,
        latestAt: entry.latestAt
      });
    }

    items.sort((a, b) => b.latestAt.localeCompare(a.latestAt));
    setUnread(items);
  }, [userEmail]);

  // Refresh the chat-count cache periodically so the badge stays current even
  // if the user leaves a tab open for hours.
  useEffect(() => {
    void loadUnread();
    const interval = setInterval(() => {
      invalidateCommentCounts();
      void loadUnread();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadUnread]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      const target = event.target as Node;
      const insideBell = panelRef.current?.contains(target) ?? false;
      const insidePanel = panelContentRef.current?.contains(target) ?? false;
      if (!insideBell && !insidePanel) {
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
      invalidateCommentCounts();
      void loadUnread();
    }
    setIsOpen((prev) => !prev);
  }

  function handleThreadClick(): void {
    setIsOpen(false);
    // After navigation we'll re-check on next mount. The ChatIconButton on the
    // destination page marks the thread as read when the modal opens.
  }

  const totalUnreadMessages = unread.reduce((sum, t) => sum + t.newCount, 0);
  const badgeLabel = totalUnreadMessages > 9 ? "9+" : String(totalUnreadMessages);

  return (
    <div className="notif-bell-wrap" ref={panelRef}>
      <button
        ref={bellRef}
        type="button"
        className="notif-bell-btn"
        aria-label={`Chat notifications${totalUnreadMessages > 0 ? ` (${totalUnreadMessages})` : ""}`}
        onClick={handleBellClick}
      >
        <BellIcon />
        {totalUnreadMessages > 0 && (
          <span className="notif-badge" aria-hidden="true">
            {badgeLabel}
          </span>
        )}
      </button>

      {isOpen && panelPos && createPortal(
        <div
          ref={panelContentRef}
          className="notif-panel"
          role="dialog"
          aria-label="Chat notifications"
          style={{ position: "fixed", top: panelPos.top, left: panelPos.left }}
        >
          <div className="notif-panel-header">Chat notifications</div>

          {unread.length === 0 ? (
            <p className="notif-empty">No new chat messages.</p>
          ) : (
            <ul className="notif-list">
              {unread.map((thread) => {
                const breadcrumb =
                  thread.entityType === "kr"
                    ? thread.parentObjectiveCode
                      ? `OBJ ${thread.parentObjectiveCode} › KR ${thread.code}`
                      : `KR ${thread.code}`
                    : `OBJ ${thread.code}`;
                return (
                  <li key={thread.id} className="notif-item">
                    <Link
                      href={entityHref(thread.entityType, thread.entityKey)}
                      className="notif-chat-row"
                      onClick={handleThreadClick}
                    >
                      <span className="notif-chat-icon" aria-hidden="true">
                        <ChatBubbleIcon />
                      </span>
                      <span className="notif-chat-text">
                        <span className="notif-chat-meta">{breadcrumb}</span>
                        <span className="notif-chat-title">{thread.title}</span>
                      </span>
                      <span className="notif-chat-count" aria-label={`${thread.newCount} new messages`}>
                        {thread.newCount > 9 ? "9+" : thread.newCount}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
