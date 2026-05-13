"use client";

import type { Comment } from "@/lib/types";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import useCurrentUserEmail from "./use-current-user-email";

const ChatModal = dynamic(() => import("@/app/chat-modal"), { ssr: false });

type Props = {
  entityType: "objective" | "kr";
  entityKey: string;
  entityLabel: string;
};

const STORAGE_PREFIX = "okr-chat-last-read";

function getLastReadKey(entityType: string, entityKey: string, userEmail: string): string {
  return `${STORAGE_PREFIX}::${entityType}::${entityKey}::${userEmail.toLowerCase()}`;
}

function getLastRead(entityType: string, entityKey: string, userEmail: string): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(getLastReadKey(entityType, entityKey, userEmail)) ?? "";
  } catch {
    return "";
  }
}

function setLastRead(entityType: string, entityKey: string, userEmail: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getLastReadKey(entityType, entityKey, userEmail), new Date().toISOString());
  } catch {
    // ignore
  }
}

function countUnread(comments: Comment[], lastRead: string): number {
  if (!lastRead) return 0;
  return comments.filter((c) => c.createdAt > lastRead).length;
}

function ChatBubbleIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
    </svg>
  );
}

export default function ChatIconButton({ entityType, entityKey, entityLabel }: Props): JSX.Element {
  const currentUserEmail = useCurrentUserEmail();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(() => {
    // Initialise from localStorage on first render — only shows badge if user has opened this chat before
    if (!currentUserEmail || typeof window === "undefined") return 0;
    const lastRead = getLastRead(entityType, entityKey, currentUserEmail);
    // We don't have comments yet, so badge only shows after first open
    return lastRead ? -1 : 0; // -1 = "has been opened before, count unknown until fetch"
  });

  const handleOpen = useCallback((): void => {
    setIsOpen(true);
    if (currentUserEmail) {
      setLastRead(entityType, entityKey, currentUserEmail);
      setUnreadCount(0);
    }
  }, [currentUserEmail, entityType, entityKey]);

  const handleClose = useCallback((): void => {
    setIsOpen(false);
    if (currentUserEmail) {
      setLastRead(entityType, entityKey, currentUserEmail);
    }
  }, [currentUserEmail, entityType, entityKey]);

  const handleCommentsLoaded = useCallback(
    (comments: Comment[]): void => {
      if (!currentUserEmail) return;
      // After loading, compute unread since the timestamp BEFORE we just set it
      // We store the read time when opening, so anything before that open is "read"
      const lastRead = getLastRead(entityType, entityKey, currentUserEmail);
      const unread = countUnread(comments, lastRead);
      setUnreadCount(unread);
    },
    [currentUserEmail, entityType, entityKey]
  );

  const showBadge = unreadCount > 0;

  return (
    <>
      <button
        type="button"
        className="chat-icon-btn"
        onClick={handleOpen}
        aria-label={`Open discussion for ${entityLabel}${showBadge ? `, ${unreadCount} unread` : ""}`}
        title={`Discussion${showBadge ? ` (${unreadCount} new)` : ""}`}
      >
        <ChatBubbleIcon />
        {showBadge && (
          <span className="chat-icon-badge" aria-hidden="true">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && currentUserEmail && (
        <ChatModal
          entityType={entityType}
          entityKey={entityKey}
          title={entityLabel}
          currentUserEmail={currentUserEmail}
          onClose={handleClose}
          onCommentsLoaded={handleCommentsLoaded}
        />
      )}
    </>
  );
}
