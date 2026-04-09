"use client";

export const OKR_OPERATION_BATCH_EVENT = "okr-operation-batch";

export type OperationBatchSnapshot = {
  batchId: string;
  label: string;
  currentStep: number;
  totalSteps: number;
};

type WindowWithOperationBatch = Window & {
  __okrActiveOperationBatch?: OperationBatchSnapshot | null;
};

type OperationBatchController = {
  finish: () => void;
  setCurrentStep: (currentStep: number) => void;
};

function getTrackedWindow(): WindowWithOperationBatch | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window as WindowWithOperationBatch;
}

function emitBatch(snapshot: OperationBatchSnapshot | null): void {
  const trackedWindow = getTrackedWindow();
  if (!trackedWindow) {
    return;
  }

  trackedWindow.__okrActiveOperationBatch = snapshot;
  window.dispatchEvent(
    new CustomEvent<OperationBatchSnapshot | null>(OKR_OPERATION_BATCH_EVENT, {
      detail: snapshot
    })
  );
}

function createBatchId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `okr-batch-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getActiveOperationBatch(): OperationBatchSnapshot | null {
  return getTrackedWindow()?.__okrActiveOperationBatch ?? null;
}

export function beginOperationBatch(label: string, totalSteps: number): OperationBatchController {
  if (totalSteps <= 1) {
    return {
      finish: () => undefined,
      setCurrentStep: () => undefined
    };
  }

  const batchId = createBatchId();
  const baseSnapshot: OperationBatchSnapshot = {
    batchId,
    label: label.trim() || "Saving",
    currentStep: 1,
    totalSteps
  };

  emitBatch(baseSnapshot);

  return {
    finish: () => {
      const activeBatch = getActiveOperationBatch();
      if (!activeBatch || activeBatch.batchId !== batchId) {
        return;
      }

      emitBatch(null);
    },
    setCurrentStep: (currentStep: number) => {
      const activeBatch = getActiveOperationBatch();
      if (!activeBatch || activeBatch.batchId !== batchId) {
        return;
      }

      emitBatch({
        ...activeBatch,
        currentStep: Math.max(1, Math.min(totalSteps, Math.round(currentStep)))
      });
    }
  };
}
