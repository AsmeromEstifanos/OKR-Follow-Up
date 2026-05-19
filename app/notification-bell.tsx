"use client";

import { getCommentCounts, invalidateCommentCounts } from "@/lib/comment-counts";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  userEmail: string;
};

type ChatThread = {
  id: string;
  entityType: "objective" | "kr";
  entityKey: string;
  title: string;
  code: string;
  parentObjectiveCode?: string;
  totalCount: number;
  newCount: number;
  hasUnread: boolean;
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
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelContentRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  const loadThreads = useCallback(async (): Promise<void> => {
    if (!userEmail) return;
    const counts = await getCommentCounts();
    const items: ChatThread[] = [];

    for (const [id, entry] of Object.entries(counts)) {
      if (entry.count === 0 || !entry.entityType || !entry.entityKey) continue;
      const lr = getLastRead(entry.entityType, entry.entityKey, userEmail);
      const timestamps = entry.timestamps ?? [];
      const newCount = lr
        ? timestamps.filter((t) => t > lr).length
        : entry.count;
      items.push({
        id,
        entityType: entry.entityType,
        entityKey: entry.entityKey,
        title: entry.title ?? entry.entityKey,
        code: entry.code ?? entry.entityKey,
        parentObjectiveCode: entry.parentObjectiveCode,
        totalCount: entry.count,
        newCount,
        hasUnread: newCount > 0,
        latestAt: entry.latestAt
      });
    }

    // Unread threads first, then sort by most recent activity within each group.
    items.sort((a, b) => {
      if (a.hasUnread !== b.hasUnread) return a.hasUnread ? -1 : 1;
      return b.latestAt.localeCompare(a.latestAt);
    });
    setThreads(items);
  }, [userEmail]);

  // Refresh the chat-count cache periodically so the badge stays current even
  // if the user leaves a tab open for hours.
  useEffect(() => {
    void loadThreads();
    const interval = setInterval(() => {
      invalidateCommentCounts();
      void loadThreads();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadThreads]);

  // Re-check unread counts when any chat modal closes and writes its
  // last-read timestamp (same-tab custom event dispatched by setLastRead).
  useEffect(() => {
    function handleLastRead(): void {
      void loadThreads();
    }
    window.addEventListener("okr-chat-last-read-updated", handleLastRead);
    return () => window.removeEventListener("okr-chat-last-read-updated", handleLastRead);
  }, [loadThreads]);

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
      void loadThreads();
    }
    setIsOpen((prev) => !prev);
  }

  function handleThreadClick(): void {
    setIsOpen(false);
    // After navigation we'll re-check on next mount. The ChatIconButton on the
    // destination page marks the thread as read when the modal opens.
  }

  const totalUnreadMessages = threads.reduce((sum, t) => sum + t.newCount, 0);
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

          {threads.length === 0 ? (
            <p className="notif-empty">No chat messages yet.</p>
          ) : (
            <ul className="notif-list">
              {threads.map((thread) => {
                const breadcrumb =
                  thread.entityType === "kr"
                    ? thread.parentObjectiveCode
                      ? `OBJ ${thread.parentObjectiveCode} › KR ${thread.code}`
                      : `KR ${thread.code}`
                    : `OBJ ${thread.code}`;
                return (
                  <li key={thread.id} className={`notif-item${thread.hasUnread ? " notif-item-unread" : ""}`}>
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
                        <span className={`notif-chat-title${thread.hasUnread ? " notif-chat-title-unread" : ""}`}>
                          {thread.title}
                        </span>
                      </span>
                      {thread.hasUnread ? (
                        <span className="notif-chat-count notif-chat-count-unread" aria-label={`${thread.newCount} unread`}>
                          {thread.newCount > 9 ? "9+" : thread.newCount}
                        </span>
                      ) : (
                        <span className="notif-chat-count notif-chat-count-read" aria-label={`${thread.totalCount} messages`}>
                          {thread.totalCount > 9 ? "9+" : thread.totalCount}
                        </span>
                      )}
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
