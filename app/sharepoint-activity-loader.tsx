"use client";

import { useEffect, useState } from "react";

const SHAREPOINT_ACTIVITY_EVENT = "okr-sharepoint-activity";

type ActivityEventDetail = {
  pendingCount: number;
};

type WindowWithSharePointTracking = Window & {
  __okrSharePointFetchPatched?: boolean;
  __okrSharePointPendingCount?: number;
};

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

function shouldTrackSharePointRequest(rawUrl: string): boolean {
  if (!rawUrl) {
    return false;
  }

  if (rawUrl.startsWith("/api/")) {
    if (rawUrl.startsWith("/api/users/suggest") || rawUrl.startsWith("/api/codes/")) {
      return false;
    }

    return true;
  }

  try {
    const parsed = new URL(rawUrl, window.location.origin);
    if (parsed.origin === window.location.origin && parsed.pathname.startsWith("/api/")) {
      if (parsed.pathname.startsWith("/api/users/suggest") || parsed.pathname.startsWith("/api/codes/")) {
        return false;
      }

      return true;
    }

    return parsed.hostname.toLowerCase() === "graph.microsoft.com" && parsed.pathname.startsWith("/v1.0/sites/");
  } catch {
    return false;
  }
}

function emitSharePointActivity(pendingCount: number): void {
  window.dispatchEvent(
    new CustomEvent<ActivityEventDetail>(SHAREPOINT_ACTIVITY_EVENT, {
      detail: { pendingCount }
    })
  );
}

function patchFetchOnce(): void {
  const trackedWindow = window as WindowWithSharePointTracking;
  if (trackedWindow.__okrSharePointFetchPatched) {
    return;
  }

  const nativeFetch = window.fetch.bind(window);
  trackedWindow.__okrSharePointPendingCount = trackedWindow.__okrSharePointPendingCount ?? 0;

  const patchedFetch: typeof window.fetch = async (...args) => {
    const [input] = args;
    const url = getRequestUrl(input);
    const isTracked = shouldTrackSharePointRequest(url);

    if (!isTracked) {
      return nativeFetch(...args);
    }

    trackedWindow.__okrSharePointPendingCount = (trackedWindow.__okrSharePointPendingCount ?? 0) + 1;
    emitSharePointActivity(trackedWindow.__okrSharePointPendingCount);

    try {
      return await nativeFetch(...args);
    } finally {
      trackedWindow.__okrSharePointPendingCount = Math.max(0, (trackedWindow.__okrSharePointPendingCount ?? 1) - 1);
      emitSharePointActivity(trackedWindow.__okrSharePointPendingCount);
    }
  };

  window.fetch = patchedFetch;
  trackedWindow.__okrSharePointFetchPatched = true;
}

export default function SharePointActivityLoader(): JSX.Element | null {
  const [pendingCount, setPendingCount] = useState<number>(0);

  useEffect(() => {
    patchFetchOnce();

    const trackedWindow = window as WindowWithSharePointTracking;
    setPendingCount(trackedWindow.__okrSharePointPendingCount ?? 0);

    const onActivity = (event: Event): void => {
      const detail = (event as CustomEvent<ActivityEventDetail>).detail;
      setPendingCount(Math.max(0, detail?.pendingCount ?? 0));
    };

    window.addEventListener(SHAREPOINT_ACTIVITY_EVENT, onActivity);
    return () => {
      window.removeEventListener(SHAREPOINT_ACTIVITY_EVENT, onActivity);
    };
  }, []);

  if (pendingCount < 1) {
    return null;
  }

  return (
    <div className="sp-loader-overlay" aria-live="polite" aria-busy="true">
      <div className="sp-loader-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/loader-ring.svg" alt="Loading SharePoint data" width={72} height={72} className="sp-loader-image" />
        <p className="sp-loader-text">Syncing with SharePoint...</p>
      </div>
    </div>
  );
}
