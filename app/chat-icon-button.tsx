"use client";

import type { Comment } from "@/lib/types";
import { commentCountKey, getCommentCounts } from "@/lib/comment-counts";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
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

const LAST_READ_EVENT = "okr-chat-last-read-updated";

function setLastRead(entityType: string, entityKey: string, userEmail: string, atTimestamp?: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getLastReadKey(entityType, entityKey, userEmail), atTimestamp ?? new Date().toISOString());
    window.dispatchEvent(new CustomEvent(LAST_READ_EVENT));
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

function ChatIconButtonInner({ entityType, entityKey, entityLabel }: Props): JSX.Element {
  const currentUserEmail = useCurrentUserEmail();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  // Tracks the createdAt of the latest comment seen in the modal so we mark
  // read up to that point (not "now"), leaving future messages as unread.
  const latestCommentAtRef = useRef<string>("");

  // Load the shared comment-count map once and pick out this entity's total +
  // exact unread count based on per-user last-read timestamp.
  useEffect(() => {
    let cancelled = false;
    void getCommentCounts().then((counts) => {
      if (cancelled) return;
      const entry = counts[commentCountKey(entityType, entityKey)];
      if (!entry || entry.count === 0) {
        setTotalCount(0);
        setUnreadCount(0);
        return;
      }
      setTotalCount(entry.count);
      const lastRead = currentUserEmail ? getLastRead(entityType, entityKey, currentUserEmail) : "";
      const timestamps = entry.timestamps ?? [];
      const newCount = lastRead
        ? timestamps.filter((t) => t > lastRead).length
        : entry.count;
      setUnreadCount(newCount);
    });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityKey, currentUserEmail]);

  const handleOpen = useCallback((): void => {
    setIsOpen(true);
  }, []);

  // Auto-open when the URL carries ?openChat=<type>::<key> matching this
  // button. useSearchParams re-fires on every client-side navigation so the
  // modal opens even when the board is already mounted (no full page reload).
  useEffect(() => {
    const openChat = searchParams.get("openChat");
    if (!openChat) return;
    if (openChat !== `${entityType}::${entityKey}`) return;
    handleOpen();
    // Strip the param so the modal doesn't re-open on subsequent renders.
    const params = new URLSearchParams(window.location.search);
    params.delete("openChat");
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash;
    window.history.replaceState({}, "", newUrl);
  }, [searchParams, entityType, entityKey, handleOpen]);

  const handleClose = useCallback((): void => {
    setIsOpen(false);
    if (currentUserEmail && latestCommentAtRef.current) {
      setLastRead(entityType, entityKey, currentUserEmail, latestCommentAtRef.current);
      setUnreadCount(0);
    }
  }, [currentUserEmail, entityType, entityKey]);

  const handleCommentsLoaded = useCallback((comments: Comment[]): void => {
    setTotalCount(comments.length);
    // Track the newest comment timestamp so close marks read up to here only.
    const latest = comments.map((c) => c.createdAt).sort().at(-1) ?? "";
    latestCommentAtRef.current = latest;
  }, []);

  const showBadge = totalCount > 0;
  const badgeCount = unreadCount > 0 ? unreadCount : totalCount;

  return (
    <>
      <button
        type="button"
        className="chat-icon-btn"
        onClick={handleOpen}
        aria-label={`Open discussion for ${entityLabel}${
          showBadge ? `, ${totalCount} message${totalCount === 1 ? "" : "s"}${unreadCount > 0 ? `, ${unreadCount} unread` : ""}` : ""
        }`}
        title={`Discussion${showBadge ? ` (${totalCount} message${totalCount === 1 ? "" : "s"})` : ""}`}
      >
        <ChatBubbleIcon />
        {showBadge && (
          <span
            className={`chat-icon-badge ${unreadCount > 0 ? "chat-icon-badge-unread" : ""}`}
            aria-hidden="true"
          >
            {badgeCount > 9 ? "9+" : badgeCount}
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

export default function ChatIconButton(props: Props): JSX.Element {
  return (
    <Suspense fallback={null}>
      <ChatIconButtonInner {...props} />
    </Suspense>
  );
}
