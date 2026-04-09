"use client";

import {
  getActiveOperationBatch,
  OKR_OPERATION_BATCH_EVENT,
  type OperationBatchSnapshot
} from "@/lib/client-operation-batch";
import { stripBasePath, withBasePath } from "@/lib/base-path";
import { useEffect, useState } from "react";

const SHAREPOINT_ACTIVITY_EVENT = "okr-sharepoint-activity";
const PROGRESS_POLL_INTERVAL_MS = 350;

type OperationProgress = {
  operationId: string;
  percent: number;
  stage: string;
  status: "running" | "completed" | "failed";
  currentStep?: number;
  totalSteps?: number;
};

type ActivityEventDetail = {
  pendingCount: number;
  activeOperation: OperationProgress | null;
};

type WindowWithSharePointTracking = Window & {
  __okrSharePointFetchPatched?: boolean;
  __okrSharePointPendingCount?: number;
  __okrSharePointOperations?: Map<string, OperationProgress>;
  __okrSharePointOperationOrder?: string[];
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

  if (rawUrl.startsWith("/")) {
    const normalizedPath = stripBasePath(rawUrl);
    if (!normalizedPath.startsWith("/api/")) {
      return false;
    }

    return (
      !normalizedPath.startsWith("/api/users/suggest") &&
      !normalizedPath.startsWith("/api/codes/") &&
      !normalizedPath.startsWith("/api/operation-progress/")
    );
  }

  try {
    const parsed = new URL(rawUrl, window.location.origin);
    if (parsed.origin === window.location.origin) {
      const normalizedPath = stripBasePath(parsed.pathname);
      if (!normalizedPath.startsWith("/api/")) {
        return false;
      }

      if (
        normalizedPath.startsWith("/api/users/suggest") ||
        normalizedPath.startsWith("/api/codes/") ||
        normalizedPath.startsWith("/api/operation-progress/")
      ) {
        return false;
      }

      return true;
    }

    return parsed.hostname.toLowerCase() === "graph.microsoft.com" && parsed.pathname.startsWith("/v1.0/sites/");
  } catch {
    return false;
  }
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  const methodFromInit = init?.method;
  if (typeof methodFromInit === "string" && methodFromInit.trim().length > 0) {
    return methodFromInit.toUpperCase();
  }

  if (input instanceof Request && typeof input.method === "string" && input.method.trim().length > 0) {
    return input.method.toUpperCase();
  }

  return "GET";
}

function shouldAttachOperationProgress(rawUrl: string, method: string): boolean {
  if (!["POST", "PATCH", "DELETE"].includes(method.toUpperCase())) {
    return false;
  }

  try {
    const parsed = new URL(rawUrl, window.location.origin);
    if (parsed.origin !== window.location.origin) {
      return false;
    }

    const normalizedPath = stripBasePath(parsed.pathname);
    return normalizedPath.startsWith("/api/") && !normalizedPath.startsWith("/api/operation-progress/");
  } catch {
    return false;
  }
}

function getActiveOperation(trackedWindow: WindowWithSharePointTracking): OperationProgress | null {
  const operations = trackedWindow.__okrSharePointOperations;
  const order = trackedWindow.__okrSharePointOperationOrder ?? [];
  if (!operations || operations.size === 0) {
    return null;
  }

  for (let index = order.length - 1; index >= 0; index -= 1) {
    const operationId = order[index];
    const operation = operations.get(operationId);
    if (operation) {
      return operation;
    }
  }

  const firstOperation = operations.values().next();
  return firstOperation.done ? null : firstOperation.value;
}

function emitSharePointActivity(pendingCount: number, trackedWindow?: WindowWithSharePointTracking): void {
  const activityWindow = trackedWindow ?? (window as WindowWithSharePointTracking);
  window.dispatchEvent(
    new CustomEvent<ActivityEventDetail>(SHAREPOINT_ACTIVITY_EVENT, {
      detail: {
        pendingCount,
        activeOperation: getActiveOperation(activityWindow)
      }
    })
  );
}

function upsertOperation(trackedWindow: WindowWithSharePointTracking, operation: OperationProgress): void {
  const operations = trackedWindow.__okrSharePointOperations ?? new Map<string, OperationProgress>();
  trackedWindow.__okrSharePointOperations = operations;

  const order = trackedWindow.__okrSharePointOperationOrder ?? [];
  if (!operations.has(operation.operationId)) {
    trackedWindow.__okrSharePointOperationOrder = [...order, operation.operationId];
  }

  operations.set(operation.operationId, operation);
  emitSharePointActivity(trackedWindow.__okrSharePointPendingCount ?? 0, trackedWindow);
}

function removeOperation(trackedWindow: WindowWithSharePointTracking, operationId: string): void {
  trackedWindow.__okrSharePointOperations?.delete(operationId);
  trackedWindow.__okrSharePointOperationOrder = (trackedWindow.__okrSharePointOperationOrder ?? []).filter(
    (value) => value !== operationId
  );
  emitSharePointActivity(trackedWindow.__okrSharePointPendingCount ?? 0, trackedWindow);
}

function withOperationHeader(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  operationId: string
): [RequestInfo | URL, RequestInit | undefined] {
  if (input instanceof Request) {
    const headers = new Headers(input.headers);
    new Headers(init?.headers).forEach((value, key) => {
      headers.set(key, value);
    });
    headers.set("x-okr-operation-id", operationId);
    return [new Request(input, { ...init, headers }), undefined];
  }

  const headers = new Headers(init?.headers);
  headers.set("x-okr-operation-id", operationId);
  return [input, { ...init, headers }];
}

function createOperationId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `okr-op-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function fetchOperationProgress(operationId: string): Promise<OperationProgress | null> {
  try {
    const response = await window.fetch(withBasePath(`/api/operation-progress/${encodeURIComponent(operationId)}`), {
      method: "GET",
      cache: "no-store"
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as Partial<OperationProgress>;
    if (
      typeof payload?.operationId !== "string" ||
      typeof payload?.percent !== "number" ||
      typeof payload?.stage !== "string" ||
      (payload?.status !== "running" && payload?.status !== "completed" && payload?.status !== "failed")
    ) {
      return null;
    }

    return {
      operationId: payload.operationId,
      percent: payload.percent,
      stage: payload.stage,
      status: payload.status,
      ...(typeof payload.currentStep === "number" ? { currentStep: payload.currentStep } : {}),
      ...(typeof payload.totalSteps === "number" ? { totalSteps: payload.totalSteps } : {})
    };
  } catch {
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function patchFetchOnce(): void {
  const trackedWindow = window as WindowWithSharePointTracking;
  if (trackedWindow.__okrSharePointFetchPatched) {
    return;
  }

  const nativeFetch = window.fetch.bind(window);
  trackedWindow.__okrSharePointPendingCount = trackedWindow.__okrSharePointPendingCount ?? 0;
  trackedWindow.__okrSharePointOperations = trackedWindow.__okrSharePointOperations ?? new Map<string, OperationProgress>();
  trackedWindow.__okrSharePointOperationOrder = trackedWindow.__okrSharePointOperationOrder ?? [];

  const patchedFetch: typeof window.fetch = async (...args) => {
    const [input, init] = args;
    const url = getRequestUrl(input);
    const isTracked = shouldTrackSharePointRequest(url);
    const method = getRequestMethod(input, init);
    const shouldTrackOperation = shouldAttachOperationProgress(url, method);
    const operationId = shouldTrackOperation ? createOperationId() : null;
    const fetchArgs =
      operationId === null ? args : withOperationHeader(input, init, operationId);
    let stopPolling = false;

    if (!isTracked) {
      return nativeFetch(...fetchArgs);
    }

    trackedWindow.__okrSharePointPendingCount = (trackedWindow.__okrSharePointPendingCount ?? 0) + 1;
    if (operationId) {
      upsertOperation(trackedWindow, {
        operationId,
        percent: 2,
        stage: "Starting...",
        status: "running"
      });

      void (async () => {
        while (!stopPolling) {
          const snapshot = await fetchOperationProgress(operationId);
          if (stopPolling) {
            break;
          }

          if (snapshot) {
            upsertOperation(trackedWindow, snapshot);
            if (snapshot.status !== "running") {
              break;
            }
          }

          await delay(PROGRESS_POLL_INTERVAL_MS);
        }
      })();
    } else {
      emitSharePointActivity(trackedWindow.__okrSharePointPendingCount, trackedWindow);
    }

    try {
      return await nativeFetch(...fetchArgs);
    } finally {
      stopPolling = true;
      if (operationId) {
        const finalSnapshot = await fetchOperationProgress(operationId);
        if (finalSnapshot) {
          upsertOperation(trackedWindow, finalSnapshot);
        }
      }

      trackedWindow.__okrSharePointPendingCount = Math.max(0, (trackedWindow.__okrSharePointPendingCount ?? 1) - 1);
      if (operationId) {
        removeOperation(trackedWindow, operationId);
      } else {
        emitSharePointActivity(trackedWindow.__okrSharePointPendingCount, trackedWindow);
      }
    }
  };

  window.fetch = patchedFetch;
  trackedWindow.__okrSharePointFetchPatched = true;
}

export default function SharePointActivityLoader(): JSX.Element | null {
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [activeOperation, setActiveOperation] = useState<OperationProgress | null>(null);
  const [activeBatch, setActiveBatch] = useState<OperationBatchSnapshot | null>(null);

  useEffect(() => {
    patchFetchOnce();

    const trackedWindow = window as WindowWithSharePointTracking;
    setPendingCount(trackedWindow.__okrSharePointPendingCount ?? 0);
    setActiveOperation(getActiveOperation(trackedWindow));
    setActiveBatch(getActiveOperationBatch());

    const onActivity = (event: Event): void => {
      const detail = (event as CustomEvent<ActivityEventDetail>).detail;
      setPendingCount(Math.max(0, detail?.pendingCount ?? 0));
      setActiveOperation(detail?.activeOperation ?? null);
    };

    const onBatch = (event: Event): void => {
      setActiveBatch((event as CustomEvent<OperationBatchSnapshot | null>).detail ?? null);
    };

    window.addEventListener(SHAREPOINT_ACTIVITY_EVENT, onActivity);
    window.addEventListener(OKR_OPERATION_BATCH_EVENT, onBatch);
    return () => {
      window.removeEventListener(SHAREPOINT_ACTIVITY_EVENT, onActivity);
      window.removeEventListener(OKR_OPERATION_BATCH_EVENT, onBatch);
    };
  }, []);

  const displayStage = activeOperation?.stage ?? activeBatch?.label ?? null;
  const displayCount =
    activeBatch && activeBatch.totalSteps > 1
      ? activeBatch
      : activeOperation &&
          typeof activeOperation.currentStep === "number" &&
          typeof activeOperation.totalSteps === "number" &&
          activeOperation.totalSteps > 1
        ? {
            currentStep: activeOperation.currentStep,
            totalSteps: activeOperation.totalSteps
          }
        : null;

  if (pendingCount < 1 && !activeBatch) {
    return null;
  }

  return (
    <div className="sp-loader-overlay" aria-live="polite" aria-busy="true">
      <div className="sp-loader-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={withBasePath("/loader-ring.svg")}
          alt="Loading SharePoint data"
          width={72}
          height={72}
          className="sp-loader-image"
        />
        {displayStage ? <p className="sp-loader-stage">{displayStage}</p> : null}
        {displayCount ? (
          <p className="sp-loader-count">
            ({displayCount.currentStep}/{displayCount.totalSteps})
          </p>
        ) : null}
        {activeOperation ? <p className="sp-loader-progress">{activeOperation.percent}%</p> : null}
      </div>
    </div>
  );
}
