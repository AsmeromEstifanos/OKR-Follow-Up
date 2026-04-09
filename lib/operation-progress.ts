import { AsyncLocalStorage } from "node:async_hooks";

export type OperationProgressStatus = "running" | "completed" | "failed";

export type OperationProgressSnapshot = {
  operationId: string;
  status: OperationProgressStatus;
  percent: number;
  stage: string;
  currentStep?: number;
  totalSteps?: number;
  startedAt: number;
  updatedAt: number;
  error?: string;
};

type OperationContext = {
  operationId: string;
};

type GlobalOperationState = typeof globalThis & {
  __okrOperationAsyncLocal?: AsyncLocalStorage<OperationContext>;
  __okrOperationProgressMap?: Map<string, OperationProgressSnapshot>;
};

const COMPLETED_TTL_MS = 30_000;
const FAILED_TTL_MS = 60_000;

function getState(): GlobalOperationState {
  return globalThis as GlobalOperationState;
}

function getAsyncLocal(): AsyncLocalStorage<OperationContext> {
  const state = getState();
  if (!state.__okrOperationAsyncLocal) {
    state.__okrOperationAsyncLocal = new AsyncLocalStorage<OperationContext>();
  }

  return state.__okrOperationAsyncLocal;
}

function getProgressMap(): Map<string, OperationProgressSnapshot> {
  const state = getState();
  if (!state.__okrOperationProgressMap) {
    state.__okrOperationProgressMap = new Map<string, OperationProgressSnapshot>();
  }

  return state.__okrOperationProgressMap;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function cleanupExpired(): void {
  const now = Date.now();
  const progressMap = getProgressMap();

  for (const [operationId, snapshot] of progressMap.entries()) {
    const ttl = snapshot.status === "failed" ? FAILED_TTL_MS : COMPLETED_TTL_MS;
    if (snapshot.status !== "running" && now - snapshot.updatedAt > ttl) {
      progressMap.delete(operationId);
    }
  }
}

function readCurrentOperationId(): string | null {
  return getAsyncLocal().getStore()?.operationId ?? null;
}

function upsertSnapshot(
  operationId: string,
  updater: (current: OperationProgressSnapshot | undefined) => OperationProgressSnapshot
): void {
  cleanupExpired();
  const progressMap = getProgressMap();
  const current = progressMap.get(operationId);
  progressMap.set(operationId, updater(current));
}

export function getOperationIdFromHeader(value: string | null | undefined): string | undefined {
  const normalized = (value ?? "").trim();
  return normalized || undefined;
}

export function getOperationIdFromRequest(request: { headers: Headers }): string | undefined {
  return getOperationIdFromHeader(request.headers.get("x-okr-operation-id"));
}

export async function runWithOperationProgress<T>(
  operationId: string | undefined,
  initialStage: string,
  action: () => Promise<T>
): Promise<T> {
  if (!operationId) {
    return action();
  }

  const startedAt = Date.now();
  upsertSnapshot(operationId, () => ({
    operationId,
    status: "running",
    percent: 2,
    stage: initialStage,
    startedAt,
    updatedAt: startedAt
  }));

  return getAsyncLocal().run({ operationId }, async () => {
    try {
      const result = await action();
      completeOperationProgress("Completed");
      return result;
    } catch (error) {
      failOperationProgress(error instanceof Error ? error.message : "Operation failed.");
      throw error;
    }
  });
}

export function updateOperationProgress(percent: number, stage: string): void {
  updateOperationProgressWithSteps(percent, stage);
}

export function updateOperationProgressWithSteps(
  percent: number,
  stage: string,
  steps?: { currentStep?: number; totalSteps?: number }
): void {
  const operationId = readCurrentOperationId();
  if (!operationId) {
    return;
  }

  upsertSnapshot(operationId, (current) => {
    const startedAt = current?.startedAt ?? Date.now();
    return {
      operationId,
      status: current?.status === "failed" ? "failed" : "running",
      percent: Math.max(current?.percent ?? 0, clampPercent(percent)),
      stage: stage || current?.stage || "Working...",
      ...(steps?.currentStep !== undefined
        ? { currentStep: steps.currentStep }
        : current?.currentStep !== undefined
          ? { currentStep: current.currentStep }
          : {}),
      ...(steps?.totalSteps !== undefined
        ? { totalSteps: steps.totalSteps }
        : current?.totalSteps !== undefined
          ? { totalSteps: current.totalSteps }
          : {}),
      startedAt,
      updatedAt: Date.now(),
      ...(current?.error ? { error: current.error } : {})
    };
  });
}

export function completeOperationProgress(stage = "Completed"): void {
  const operationId = readCurrentOperationId();
  if (!operationId) {
    return;
  }

  upsertSnapshot(operationId, (current) => ({
    operationId,
    status: "completed",
    percent: 100,
    stage,
    ...(current?.currentStep !== undefined ? { currentStep: current.currentStep } : {}),
    ...(current?.totalSteps !== undefined ? { totalSteps: current.totalSteps } : {}),
    startedAt: current?.startedAt ?? Date.now(),
    updatedAt: Date.now(),
    ...(current?.error ? { error: current.error } : {})
  }));
}

export function failOperationProgress(errorMessage: string): void {
  const operationId = readCurrentOperationId();
  if (!operationId) {
    return;
  }

  upsertSnapshot(operationId, (current) => ({
    operationId,
    status: "failed",
    percent: clampPercent(current?.percent ?? 0),
    stage: "Failed",
    ...(current?.currentStep !== undefined ? { currentStep: current.currentStep } : {}),
    ...(current?.totalSteps !== undefined ? { totalSteps: current.totalSteps } : {}),
    startedAt: current?.startedAt ?? Date.now(),
    updatedAt: Date.now(),
    error: errorMessage
  }));
}

export function getOperationProgress(operationId: string): OperationProgressSnapshot | null {
  cleanupExpired();
  const snapshot = getProgressMap().get(operationId);
  return snapshot ? { ...snapshot } : null;
}
