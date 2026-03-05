import {
  DEMO_OWNER,
  addDepartmentToVenture as addDepartmentToVentureLocal,
  addVenture as addVentureLocal,
  createCheckIn as createCheckInLocal,
  createKeyResult as createKeyResultLocal,
  createObjective as createObjectiveLocal,
  createPeriod as createPeriodLocal,
  deleteDepartmentFromVenture as deleteDepartmentFromVentureLocal,
  deleteKeyResult as deleteKeyResultLocal,
  deleteObjective as deleteObjectiveLocal,
  deleteVenture as deleteVentureLocal,
  exportStoreSnapshot as exportStoreSnapshotLocal,
  getConfig as getConfigLocal,
  getDashboardForOwner as getDashboardForOwnerLocal,
  getKeyResult as getKeyResultLocal,
  getObjective as getObjectiveLocal,
  getObjectiveWithContext as getObjectiveWithContextLocal,
  getSeedSnapshot as getSeedSnapshotLocal,
  hydrateStoreFromSnapshot as hydrateStoreFromSnapshotLocal,
  listCheckIns as listCheckInsLocal,
  listKeyResults as listKeyResultsLocal,
  listObjectives as listObjectivesLocal,
  listPeriods as listPeriodsLocal,
  previewNextKrCode as previewNextKrCodeLocal,
  previewNextObjectiveCode as previewNextObjectiveCodeLocal,
  updateDepartmentInVenture as updateDepartmentInVentureLocal,
  updateKeyResult as updateKeyResultLocal,
  updateObjective as updateObjectiveLocal,
  updatePeriod as updatePeriodLocal,
  updateRagThresholds as updateRagThresholdsLocal,
  updateVenture as updateVentureLocal,
  type StoreSnapshot
} from "@/lib/dummy-store";
import { ensureSharePointStore, getSharePointStorageStatus, loadSharePointSnapshot, saveSharePointSnapshot } from "@/lib/sharepoint/server-storage";
import type {
  AppConfig,
  CheckIn,
  CreateCheckInInput,
  CreateDepartmentInput,
  CreateKeyResultInput,
  CreateObjectiveInput,
  CreatePeriodInput,
  CreateVentureInput,
  DashboardMe,
  KeyResult,
  Objective,
  ObjectiveWithContext,
  Period,
  RagThresholds,
  UpdateDepartmentInput,
  UpdateKeyResultInput,
  UpdateObjectiveInput,
  UpdateVentureInput,
  Venture
} from "@/lib/types";

export { DEMO_OWNER };

type SharePointSetupStatus = {
  enabled: boolean;
  reason: string;
  siteUrl: string;
  listName: string;
  seeded: boolean;
};

const storeSyncState = globalThis as {
  __okrStoreHydrationPromise?: Promise<void>;
  __okrStoreHydrated?: boolean;
  __okrStoreSyncPromise?: Promise<void>;
};

function requireSharePointConfigured(): {
  enabled: true;
  reason: string;
  siteUrl: string;
  listName: string;
} {
  const status = getSharePointStorageStatus();
  if (!status.enabled) {
    throw new Error(`SharePoint storage is not enabled: ${status.reason}`);
  }

  return {
    enabled: true,
    reason: status.reason,
    siteUrl: status.siteUrl,
    listName: status.listName
  };
}

function getCurrentSnapshot(): StoreSnapshot {
  return exportStoreSnapshotLocal();
}

async function hydrateStoreFromSharePointInternal(): Promise<void> {
  requireSharePointConfigured();
  await ensureSharePointStore();
  const snapshot = await loadSharePointSnapshot();

  if (snapshot) {
    hydrateStoreFromSnapshotLocal(snapshot);
    return;
  }

  const seedSnapshot = getSeedSnapshotLocal();
  await saveSharePointSnapshot(seedSnapshot);
  hydrateStoreFromSnapshotLocal(seedSnapshot);
}

async function ensureStoreHydrated(): Promise<void> {
  if (storeSyncState.__okrStoreHydrated) {
    return;
  }

  if (!storeSyncState.__okrStoreHydrationPromise) {
    storeSyncState.__okrStoreHydrationPromise = hydrateStoreFromSharePointInternal()
      .then(() => {
        storeSyncState.__okrStoreHydrated = true;
      })
      .catch((error) => {
        storeSyncState.__okrStoreHydrationPromise = undefined;
        throw error;
      });
  }

  await storeSyncState.__okrStoreHydrationPromise;
}

async function syncStoreToSharePoint(): Promise<void> {
  requireSharePointConfigured();

  const previous = storeSyncState.__okrStoreSyncPromise ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      await saveSharePointSnapshot(getCurrentSnapshot());
    });

  storeSyncState.__okrStoreSyncPromise = next;
  await next;
}

type ObjectiveFilters = Parameters<typeof listObjectivesLocal>[0];
type KrFilters = Parameters<typeof listKeyResultsLocal>[0];
type CheckInFilters = Parameters<typeof listCheckInsLocal>[0];
type DashboardFilters = Parameters<typeof getDashboardForOwnerLocal>[1];

export async function setupSharePointStorage(): Promise<SharePointSetupStatus> {
  const status = requireSharePointConfigured();
  await ensureSharePointStore();

  const existing = await loadSharePointSnapshot();
  if (existing) {
    hydrateStoreFromSnapshotLocal(existing);
    storeSyncState.__okrStoreHydrated = true;
    return { ...status, seeded: false };
  }

  const seedSnapshot = getSeedSnapshotLocal();
  await saveSharePointSnapshot(seedSnapshot);
  hydrateStoreFromSnapshotLocal(seedSnapshot);
  storeSyncState.__okrStoreHydrated = true;
  return { ...status, seeded: true };
}

export async function getConfig(): Promise<AppConfig> {
  await ensureStoreHydrated();
  return getConfigLocal();
}

export async function updateRagThresholds(input: RagThresholds): Promise<AppConfig> {
  await ensureStoreHydrated();
  const config = updateRagThresholdsLocal(input);
  await syncStoreToSharePoint();
  return config;
}

export async function addVenture(input: CreateVentureInput): Promise<Venture> {
  await ensureStoreHydrated();
  const venture = addVentureLocal(input);
  await syncStoreToSharePoint();
  return venture;
}

export async function updateVenture(ventureKey: string, patch: UpdateVentureInput): Promise<Venture | null> {
  await ensureStoreHydrated();
  const venture = updateVentureLocal(ventureKey, patch);
  if (venture) {
    await syncStoreToSharePoint();
  }

  return venture;
}

export async function deleteVenture(ventureKey: string): Promise<boolean> {
  await ensureStoreHydrated();
  const deleted = deleteVentureLocal(ventureKey);
  if (deleted) {
    await syncStoreToSharePoint();
  }

  return deleted;
}

export async function addDepartmentToVenture(ventureKey: string, input: CreateDepartmentInput): Promise<Venture | null> {
  await ensureStoreHydrated();
  const venture = addDepartmentToVentureLocal(ventureKey, input);
  if (venture) {
    await syncStoreToSharePoint();
  }

  return venture;
}

export async function updateDepartmentInVenture(
  ventureKey: string,
  departmentKey: string,
  patch: UpdateDepartmentInput
): Promise<Venture | null> {
  await ensureStoreHydrated();
  const venture = updateDepartmentInVentureLocal(ventureKey, departmentKey, patch);
  if (venture) {
    await syncStoreToSharePoint();
  }

  return venture;
}

export async function deleteDepartmentFromVenture(ventureKey: string, departmentKey: string): Promise<Venture | null> {
  await ensureStoreHydrated();
  const venture = deleteDepartmentFromVentureLocal(ventureKey, departmentKey);
  if (venture) {
    await syncStoreToSharePoint();
  }

  return venture;
}

export async function listPeriods(): Promise<Period[]> {
  await ensureStoreHydrated();
  return listPeriodsLocal();
}

export async function createPeriod(input: CreatePeriodInput): Promise<Period> {
  await ensureStoreHydrated();
  const period = createPeriodLocal(input);
  await syncStoreToSharePoint();
  return period;
}

export async function updatePeriod(periodKey: string, patch: Partial<Period>): Promise<Period | null> {
  await ensureStoreHydrated();
  const period = updatePeriodLocal(periodKey, patch);
  if (period) {
    await syncStoreToSharePoint();
  }

  return period;
}

export async function listObjectives(filters: ObjectiveFilters = {}): Promise<Objective[]> {
  await ensureStoreHydrated();
  return listObjectivesLocal(filters);
}

export async function getObjective(objectiveKey: string): Promise<Objective | null> {
  await ensureStoreHydrated();
  return getObjectiveLocal(objectiveKey);
}

export async function getObjectiveWithContext(objectiveKey: string): Promise<ObjectiveWithContext | null> {
  await ensureStoreHydrated();
  return getObjectiveWithContextLocal(objectiveKey);
}

export async function createObjective(input: CreateObjectiveInput): Promise<Objective> {
  await ensureStoreHydrated();
  const objective = createObjectiveLocal(input);
  await syncStoreToSharePoint();
  return objective;
}

export async function previewNextObjectiveCode(
  departmentName: string,
  ventureName: string,
  strategicTheme: string
): Promise<string> {
  await ensureStoreHydrated();
  return previewNextObjectiveCodeLocal(departmentName, ventureName, strategicTheme);
}

export async function updateObjective(objectiveKey: string, patch: UpdateObjectiveInput): Promise<Objective | null> {
  await ensureStoreHydrated();
  const objective = updateObjectiveLocal(objectiveKey, patch);
  if (objective) {
    await syncStoreToSharePoint();
  }

  return objective;
}

export async function deleteObjective(
  objectiveKey: string
): Promise<{ objectiveKey: string; deletedKrCount: number; deletedCheckInCount: number } | null> {
  await ensureStoreHydrated();
  const result = deleteObjectiveLocal(objectiveKey);
  if (result) {
    await syncStoreToSharePoint();
  }

  return result;
}

export async function listKeyResults(filters: KrFilters = {}): Promise<KeyResult[]> {
  await ensureStoreHydrated();
  return listKeyResultsLocal(filters);
}

export async function getKeyResult(krKey: string): Promise<KeyResult | null> {
  await ensureStoreHydrated();
  return getKeyResultLocal(krKey);
}

export async function createKeyResult(input: CreateKeyResultInput): Promise<KeyResult> {
  await ensureStoreHydrated();
  const result = createKeyResultLocal(input);
  await syncStoreToSharePoint();
  return result;
}

export async function previewNextKrCode(objectiveKey: string): Promise<string> {
  await ensureStoreHydrated();
  return previewNextKrCodeLocal(objectiveKey);
}

export async function updateKeyResult(krKey: string, patch: UpdateKeyResultInput): Promise<KeyResult | null> {
  await ensureStoreHydrated();
  const result = updateKeyResultLocal(krKey, patch);
  if (result) {
    await syncStoreToSharePoint();
  }

  return result;
}

export async function deleteKeyResult(krKey: string): Promise<{ krKey: string; deletedCheckInCount: number } | null> {
  await ensureStoreHydrated();
  const result = deleteKeyResultLocal(krKey);
  if (result) {
    await syncStoreToSharePoint();
  }

  return result;
}

export async function listCheckIns(filters: CheckInFilters = {}): Promise<CheckIn[]> {
  await ensureStoreHydrated();
  return listCheckInsLocal(filters);
}

export async function createCheckIn(input: CreateCheckInInput): Promise<CheckIn> {
  await ensureStoreHydrated();
  const result = createCheckInLocal(input);
  await syncStoreToSharePoint();
  return result;
}

export async function getDashboardForOwner(owner: string = DEMO_OWNER, filters: DashboardFilters = {}): Promise<DashboardMe> {
  await ensureStoreHydrated();
  return getDashboardForOwnerLocal(owner, filters);
}
