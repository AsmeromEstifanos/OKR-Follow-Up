export const OKR_REFRESH_SYNC_KEY = "okr-refresh-sync-v1";

export function broadcastOkrRefresh(reason: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      OKR_REFRESH_SYNC_KEY,
      JSON.stringify({
        reason,
        at: Date.now(),
        nonce: Math.random().toString(36).slice(2, 10)
      })
    );
  } catch {
    // Ignore storage failures.
  }
}
