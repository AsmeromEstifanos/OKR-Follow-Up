"use client";

import type { Comment } from "@/lib/types";
import { commentCountKey, getCommentCounts } from "@/lib/comment-counts";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
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
  const [totalCount, setTotalCount] = useState<number>(0);
  const [hasUnread, setHasUnread] = useState<boolean>(false);

  // Load the shared comment-count map once and pick out this entity's total +
  // whether there's anything newer than the user last opened this thread.
  useEffect(() => {
    let cancelled = false;
    void getCommentCounts().then((counts) => {
      if (cancelled) return;
      const entry = counts[commentCountKey(entityType, entityKey)];
      if (!entry || entry.count === 0) {
        setTotalCount(0);
        setHasUnread(false);
        return;
      }
      setTotalCount(entry.count);
      const lastRead = currentUserEmail ? getLastRead(entityType, entityKey, currentUserEmail) : "";
      setHasUnread(!lastRead || entry.latestAt > lastRead);
    });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityKey, currentUserEmail]);

  const handleOpen = useCallback((): void => {
    setIsOpen(true);
    if (currentUserEmail) {
      setLastRead(entityType, entityKey, currentUserEmail);
      setHasUnread(false);
    }
  }, [currentUserEmail, entityType, entityKey]);

  const handleClose = useCallback((): void => {
    setIsOpen(false);
    if (currentUserEmail) {
      setLastRead(entityType, entityKey, currentUserEmail);
    }
  }, [currentUserEmail, entityType, entityKey]);

  const handleCommentsLoaded = useCallback((comments: Comment[]): void => {
    // The modal has the authoritative list — sync the badge total and mark read.
    setTotalCount(comments.length);
    setHasUnread(false);
  }, []);

  const showBadge = totalCount > 0;

  return (
    <>
      <button
        type="button"
        className="chat-icon-btn"
        onClick={handleOpen}
        aria-label={`Open discussion for ${entityLabel}${
          showBadge ? `, ${totalCount} message${totalCount === 1 ? "" : "s"}${hasUnread ? ", unread" : ""}` : ""
        }`}
        title={`Discussion${showBadge ? ` (${totalCount} message${totalCount === 1 ? "" : "s"})` : ""}`}
      >
        <ChatBubbleIcon />
        {showBadge && (
          <span
            className={`chat-icon-badge ${hasUnread ? "chat-icon-badge-unread" : ""}`}
            aria-hidden="true"
          >
            {totalCount > 9 ? "9+" : totalCount}
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
