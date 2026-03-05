import { clampPercent, computeKrProgress, computeObjectiveProgress, isMissingCheckin } from "@/lib/okr-rules";
import type {
  AppConfig,
  CheckInFrequency,
  CheckIn,
  CreateCheckInInput,
  CreateDepartmentInput,
  CreateKeyResultInput,
  CreateObjectiveInput,
  CreatePeriodInput,
  CreateVentureInput,
  DashboardMe,
  Department,
  KeyResult,
  KrStatus,
  MetricType,
  Objective,
  OkrCycle,
  ObjectiveType,
  UpdateObjectiveInput,
  UpdateKeyResultInput,
  ObjectiveWithContext,
  Period,
  Rag,
  RagThresholds,
  UpdateDepartmentInput,
  UpdateVentureInput,
  Venture
} from "@/lib/types";

type StoreState = {
  config: AppConfig;
  periods: Period[];
  objectives: Objective[];
  keyResults: KeyResult[];
  checkIns: CheckIn[];
};

type PersistedContent = {
  ragThresholds?: RagThresholds;
  periods: Period[];
  objectives: Objective[];
  keyResults: KeyResult[];
  checkIns: CheckIn[];
};

export type StoreSnapshot = {
  ventures: Venture[];
  content: PersistedContent;
};

export const DEMO_OWNER = "Alex Johnson";

const storeContainer = globalThis as {
  __okrDummyStore?: StoreState;
};

function readPersistedVentures(): Venture[] | null {
  // Local file persistence is intentionally disabled in SharePoint-only mode.
  return null;
}

function persistVentures(_store: StoreState): void {
  // Local file persistence is intentionally disabled in SharePoint-only mode.
}

function readPersistedContent(): PersistedContent | null {
  // Local file persistence is intentionally disabled in SharePoint-only mode.
  return null;
}

function persistContent(_store: StoreState): void {
  // Local file persistence is intentionally disabled in SharePoint-only mode.
}

function persistStore(store: StoreState): void {
  persistVentures(store);
  persistContent(store);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeKey(value: string): string {
  return value.trim();
}

function normalizeName(value: string): string {
  return value.trim();
}

function normalizeEmail(value: string): string {
  return value.trim();
}

function toSlug(value: string): string {
  const slug = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "ITEM";
}

function buildUniqueKey(existingKeys: Set<string>, prefix: string, name: string): string {
  const base = `${prefix}-${toSlug(name)}`;

  if (!existingKeys.has(base.toLowerCase())) {
    return base;
  }

  let suffix = 2;
  while (existingKeys.has(`${base}-${suffix}`.toLowerCase())) {
    suffix += 1;
  }

  return `${base}-${suffix}`;
}

function parseNumberedCode(value: string, prefix: string): number | null {
  const match = new RegExp(`^${prefix}-(\\d+)$`, "i").exec(value.trim());
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

function formatNumberedCode(prefix: string, sequence: number): string {
  const normalized = Math.max(1, Math.floor(sequence));
  return `${prefix}-${String(normalized).padStart(3, "0")}`;
}

function findVentureForObjectiveScope(
  store: StoreState,
  departmentName: string,
  ventureName: string,
  strategicTheme: string
): Venture | undefined {
  const normalizedDepartment = normalizeName(departmentName).toLowerCase();
  const normalizedVentureName = normalizeName(ventureName).toLowerCase();
  const normalizedTheme = normalizeName(strategicTheme).toLowerCase();

  if (normalizedVentureName) {
    const byVentureName = store.config.ventures.find((venture) => venture.name.toLowerCase() === normalizedVentureName);
    if (byVentureName) {
      return byVentureName;
    }
  }

  const venturesWithDepartment = store.config.ventures.filter((venture) => {
    return venture.departments.some((department) => department.name.toLowerCase() === normalizedDepartment);
  });

  if (normalizedTheme) {
    const exact = venturesWithDepartment.find((venture) => venture.name.toLowerCase() === normalizedTheme);
    if (exact) {
      return exact;
    }

    const byThemeOnly = store.config.ventures.find((venture) => venture.name.toLowerCase() === normalizedTheme);
    if (byThemeOnly) {
      return byThemeOnly;
    }
  }

  return venturesWithDepartment[0];
}

function buildObjectiveScopeKey(
  store: StoreState,
  departmentName: string,
  ventureName: string,
  strategicTheme: string
): string {
  const venture = findVentureForObjectiveScope(store, departmentName, ventureName, strategicTheme);
  const ventureScope = venture?.ventureKey.toLowerCase() || normalizeName(strategicTheme).toLowerCase() || "global";
  const departmentScope = normalizeName(departmentName).toLowerCase() || "general";
  return `${ventureScope}::${departmentScope}`;
}

function getNextObjectiveCode(store: StoreState, departmentName: string, ventureName: string, strategicTheme: string): string {
  const scopeKey = buildObjectiveScopeKey(store, departmentName, ventureName, strategicTheme);
  let maxSequence = 0;

  store.objectives.forEach((objective) => {
    if (
      buildObjectiveScopeKey(store, objective.department, objective.ventureName ?? "", objective.strategicTheme) !== scopeKey
    ) {
      return;
    }

    const candidate = normalizeKey(objective.objectiveCode ?? objective.objectiveKey);
    const parsed = parseNumberedCode(candidate, "OBJ");
    if (parsed && parsed > maxSequence) {
      maxSequence = parsed;
    }
  });

  return formatNumberedCode("OBJ", maxSequence + 1);
}

function getNextKrCode(store: StoreState, objectiveKey: string): string {
  const normalizedObjectiveKey = objectiveKey.toLowerCase();
  let maxSequence = 0;

  store.keyResults.forEach((kr) => {
    if (kr.objectiveKey.toLowerCase() !== normalizedObjectiveKey) {
      return;
    }

    const candidate = normalizeKey(kr.krCode ?? kr.krKey);
    const parsed = parseNumberedCode(candidate, "KR");
    if (parsed && parsed > maxSequence) {
      maxSequence = parsed;
    }
  });

  return formatNumberedCode("KR", maxSequence + 1);
}

function getOkrCycleFromDate(value: string): OkrCycle {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Q1";
  }

  const quarter = Math.floor(date.getMonth() / 3) + 1;
  if (quarter === 1) {
    return "Q1";
  }

  if (quarter === 2) {
    return "Q2";
  }

  if (quarter === 3) {
    return "Q3";
  }

  return "Q4";
}

function normalizeOkrCycle(value?: string): OkrCycle {
  const normalized = (value ?? "").toUpperCase();
  if (normalized === "Q1" || normalized === "Q2" || normalized === "Q3" || normalized === "Q4") {
    return normalized;
  }

  return "Q1";
}

function normalizeCheckInFrequency(value?: string): CheckInFrequency {
  if (value === "Weekly" || value === "BiWeekly" || value === "Monthly" || value === "AdHoc") {
    return value;
  }

  return "Weekly";
}

function normalizeMetricType(value?: string): MetricType {
  if (
    value === "Delivery" ||
    value === "Financial" ||
    value === "Operational" ||
    value === "People" ||
    value === "Quality"
  ) {
    return value;
  }

  if (value === "Currency") {
    return "Financial";
  }

  if (value === "Percent") {
    return "Delivery";
  }

  if (value === "Milestone") {
    return "Quality";
  }

  return "Operational";
}

function validateRagThresholds(input: RagThresholds): void {
  const greenMin = Number(input.greenMin);
  const amberMin = Number(input.amberMin);

  if (!Number.isFinite(greenMin) || !Number.isFinite(amberMin)) {
    throw new Error("RAG thresholds must be numeric.");
  }

  if (amberMin < 0 || amberMin > 99) {
    throw new Error("Amber minimum must be between 0 and 99.");
  }

  if (greenMin < 1 || greenMin > 100) {
    throw new Error("Green minimum must be between 1 and 100.");
  }

  if (amberMin >= greenMin) {
    throw new Error("Amber minimum must be lower than green minimum.");
  }
}

function getRagFromProgress(progressPct: number, thresholds: RagThresholds): Rag {
  if (progressPct >= thresholds.greenMin) {
    return "Green";
  }

  if (progressPct >= thresholds.amberMin) {
    return "Amber";
  }

  return "Red";
}

function getStatusFromProgress(progressPct: number): KrStatus {
  if (progressPct <= 0) {
    return "NotStarted";
  }

  if (progressPct >= 100) {
    return "Done";
  }

  if (progressPct >= 70) {
    return "OnTrack";
  }

  if (progressPct >= 40) {
    return "AtRisk";
  }

  return "OffTrack";
}

function findVentureByKey(store: StoreState, ventureKey: string): Venture | undefined {
  return store.config.ventures.find((venture) => venture.ventureKey.toLowerCase() === ventureKey.toLowerCase());
}

function findDepartmentByKey(venture: Venture, departmentKey: string): Department | undefined {
  return venture.departments.find((department) => department.departmentKey.toLowerCase() === departmentKey.toLowerCase());
}

function doesDepartmentExist(store: StoreState, departmentName: string): boolean {
  const expected = departmentName.toLowerCase();
  return store.config.ventures.some((venture) => {
    return venture.departments.some((department) => department.name.toLowerCase() === expected);
  });
}

function assertDepartmentExists(store: StoreState, departmentName: string): void {
  if (!doesDepartmentExist(store, departmentName)) {
    throw new Error(`Department '${departmentName}' is not configured in ventures.`);
  }
}

function ensureNoObjectiveUsesDepartment(store: StoreState, departmentName: string): void {
  const expected = departmentName.toLowerCase();
  const inUse = store.objectives.some((objective) => objective.department.toLowerCase() === expected);

  if (inUse) {
    throw new Error(`Department '${departmentName}' is used by existing objectives.`);
  }
}

function ensureNoObjectiveUsesAnyDepartment(store: StoreState, departmentNames: string[]): void {
  const expected = new Set(departmentNames.map((name) => name.toLowerCase()));
  const inUse = store.objectives.some((objective) => expected.has(objective.department.toLowerCase()));

  if (inUse) {
    throw new Error("One or more departments under this venture are used by existing objectives.");
  }
}

function recalcObjectiveInStore(store: StoreState, objectiveKey: string): void {
  const objective = store.objectives.find((item) => item.objectiveKey === objectiveKey);

  if (!objective) {
    return;
  }

  const objectiveKrs = store.keyResults.filter((kr) => kr.objectiveKey === objectiveKey);

  if (objectiveKrs.length === 0) {
    objective.progressPct = 0;
    objective.rag = getRagFromProgress(0, store.config.ragThresholds);
    return;
  }

  const progressPct = computeObjectiveProgress(objectiveKrs);
  objective.progressPct = progressPct;
  objective.rag = getRagFromProgress(progressPct, store.config.ragThresholds);
}

function recalcAllObjectivesInStore(store: StoreState): void {
  store.objectives.forEach((objective) => recalcObjectiveInStore(store, objective.objectiveKey));
}

function migrateObjectiveDefaults(store: StoreState): void {
  store.objectives.forEach((objective) => {
    if (!objective.objectiveCode) {
      objective.objectiveCode = objective.objectiveKey;
    }

    if (!objective.ventureName) {
      const venture = findVentureForObjectiveScope(store, objective.department, "", objective.strategicTheme);
      objective.ventureName = venture?.name ?? "";
    }

    if (!objective.objectiveType) {
      objective.objectiveType = "Committed";
    }

    if (!objective.strategicTheme) {
      const venture = store.config.ventures.find((item) => {
        return item.departments.some((department) => department.name.toLowerCase() === objective.department.toLowerCase());
      });

      objective.strategicTheme = venture?.name ?? "General";
    }

    if (!objective.okrCycle) {
      objective.okrCycle = getOkrCycleFromDate(objective.startDate);
    }

    if (objective.blockers === undefined || objective.blockers === null) {
      objective.blockers = "";
    }

    if (!objective.keyRisksDependency) {
      objective.keyRisksDependency = "";
    }

    if (!objective.notes) {
      objective.notes = objective.description ?? "";
    }

    if (typeof objective.lastCheckinAt !== "string" && objective.lastCheckinAt !== null) {
      objective.lastCheckinAt = null;
    }
  });
}

function migrateKrDefaults(store: StoreState): void {
  store.keyResults.forEach((kr) => {
    if (!kr.krCode) {
      kr.krCode = kr.krKey;
    }

    if (!kr.checkInFrequency) {
      kr.checkInFrequency = "Weekly";
    }

    kr.metricType = normalizeMetricType(kr.metricType);

    if (kr.blockers === undefined || kr.blockers === null) {
      kr.blockers = "";
    }

    if (kr.notes === undefined || kr.notes === null) {
      kr.notes = "";
    }

    if (typeof kr.lastCheckinAt !== "string" && kr.lastCheckinAt !== null) {
      kr.lastCheckinAt = null;
    }
  });
}

function migrateSeedVentures(store: StoreState): void {
  const upsertVenture = (
    ventureKey: string,
    name: string,
    departments: Department[],
    aliases: string[]
  ): void => {
    const canonicalKey = ventureKey.toLowerCase();
    const canonicalName = name.toLowerCase();
    const defaultDepartments = departments.map((department) => ({ ...department }));
    const aliasSet = new Set([name.toLowerCase(), ventureKey.toLowerCase(), ...aliases.map((alias) => alias.toLowerCase())]);

    const existing = store.config.ventures.find((venture) => {
      return aliasSet.has(venture.name.toLowerCase()) || aliasSet.has(venture.ventureKey.toLowerCase());
    });

    if (existing) {
      const keyMatches = existing.ventureKey.toLowerCase() === canonicalKey;
      const nameMatches = existing.name.toLowerCase() === canonicalName;

      existing.ventureKey = ventureKey;
      existing.name = name;

      if (keyMatches && nameMatches) {
        const mergedDepartments = [...existing.departments];
        const existingNames = new Set(mergedDepartments.map((department) => department.name.toLowerCase()));

        defaultDepartments.forEach((department) => {
          if (!existingNames.has(department.name.toLowerCase())) {
            mergedDepartments.push({ ...department });
          }
        });

        existing.departments = mergedDepartments;
      } else {
        // Legacy venture names/keys are normalized to the new defaults.
        existing.departments = defaultDepartments;
      }

      return;
    }

    store.config.ventures.push({
      ventureKey,
      name,
      departments: defaultDepartments
    });
  };

  upsertVenture(
    "VENT-SVH",
    "SVH",
    [
      { departmentKey: "POS-SVH-PRES", name: "President" },
      { departmentKey: "POS-SVH-CFO", name: "CFO" },
      { departmentKey: "POS-SVH-CIO", name: "CIO" }
    ],
    []
  );
  upsertVenture(
    "VENT-EASE",
    "EASE Engineering",
    [
      { departmentKey: "POS-EASE-CTO", name: "CTO" },
      { departmentKey: "POS-EASE-VPE", name: "VP Engineering" },
      { departmentKey: "POS-EASE-VPP", name: "VP Product" }
    ],
    ["core platform", "vent-core"]
  );
  upsertVenture(
    "VENT-SINO",
    "Sino-Africa",
    [
      { departmentKey: "POS-SINO-MD", name: "Managing Director" },
      { departmentKey: "POS-SINO-COMM", name: "Commercial Director" },
      { departmentKey: "POS-SINO-PART", name: "Partnerships Director" }
    ],
    ["go to market", "vent-gtm"]
  );

  const seenVentureKeys = new Set<string>();
  store.config.ventures = store.config.ventures.filter((venture) => {
    const normalizedName = venture.name.toLowerCase();
    if (normalizedName === "core platform" || normalizedName === "go to market") {
      return false;
    }

    const normalizedKey = venture.ventureKey.toLowerCase();
    if (seenVentureKeys.has(normalizedKey)) {
      return false;
    }

    seenVentureKeys.add(normalizedKey);
    return true;
  });

  store.objectives.forEach((objective) => {
    if (objective.strategicTheme.toLowerCase() === "core platform") {
      objective.strategicTheme = "EASE Engineering";
    }

    if (objective.strategicTheme.toLowerCase() === "go to market") {
      objective.strategicTheme = "Sino-Africa";
    }

    const normalizedDepartment = objective.department.toLowerCase();
    if (normalizedDepartment === "engineering") {
      objective.department = "VP Engineering";
    }

    if (normalizedDepartment === "product") {
      objective.department = "VP Product";
    }

    if (normalizedDepartment === "marketing") {
      objective.department = "Commercial Director";
    }

    if (normalizedDepartment === "sales") {
      objective.department = "Partnerships Director";
    }

    if (normalizedDepartment === "corporate strategy" || normalizedDepartment === "executive office") {
      objective.department = "President";
    }
  });

  const activePeriod = store.periods.find((period) => period.status === "Active") ?? store.periods[0];
  if (!activePeriod) {
    return;
  }

  const hasSvhObjective = store.objectives.some((objective) => {
    return objective.department.toLowerCase() === "president" || objective.objectiveKey.toLowerCase() === "okr-004";
  });

  if (!hasSvhObjective) {
    store.objectives.push({
      objectiveKey: "OKR-004",
      periodKey: activePeriod.periodKey,
      title: "Drive group governance cadence",
      description: "Improve group-level planning and executive accountability rhythms.",
      owner: "Sarah Rahman",
      department: "President",
      strategicTheme: "SVH",
      objectiveType: "Committed",
      okrCycle: getOkrCycleFromDate(activePeriod.startDate),
      keyRisksDependency: "Cross-team planning input is still inconsistent.",
      notes: "Track monthly governance packs and decision turnaround.",
      status: "OnTrack",
      progressPct: 0,
      confidence: "High",
      rag: "Green",
      startDate: activePeriod.startDate,
      endDate: activePeriod.endDate,
      lastCheckinAt: null
    });
  }

  const hasSvhKr = store.keyResults.some((kr) => kr.krKey.toLowerCase() === "kr-005");
  if (!hasSvhKr) {
    store.keyResults.push({
      krKey: "KR-005",
      objectiveKey: "OKR-004",
      periodKey: activePeriod.periodKey,
      title: "Complete 12 monthly governance packs",
      owner: "Sarah Rahman",
      metricType: "Delivery",
      baselineValue: 0,
      targetValue: 12,
      currentValue: 8,
      progressPct: computeKrProgress(0, 12, 8),
      status: "OnTrack",
      dueDate: activePeriod.endDate,
      checkInFrequency: "Monthly",
      notes: "Board-level packs delivered with status and decisions.",
      lastCheckinAt: addDays(new Date(), -5).toISOString()
    });
  }

  const hasSvhCheckin = store.checkIns.some((checkIn) => checkIn.krKey.toLowerCase() === "kr-005");
  if (!hasSvhCheckin) {
    store.checkIns.push({
      checkInAt: addDays(new Date(), -5).toISOString(),
      periodKey: activePeriod.periodKey,
      objectiveKey: "OKR-004",
      krKey: "KR-005",
      owner: "Sarah Rahman",
      status: "OnTrack",
      confidence: "Medium",
      updateNotes: "Executive review pack cadence is stable and improving.",
      blockers: "",
      supportNeeded: "Need timely input from two departments before each board meeting.",
      currentValueSnapshot: 8,
      progressPctSnapshot: computeKrProgress(0, 12, 8),
      attachments: []
    });
  }

  recalcAllObjectivesInStore(store);
}

function buildSeedStore(): StoreState {
  const now = new Date();
  const activePeriodStart = toDateOnly(addDays(now, -20));
  const activePeriodEnd = toDateOnly(addDays(now, 70));
  const plannedPeriodStart = toDateOnly(addDays(now, 71));
  const plannedPeriodEnd = toDateOnly(addDays(now, 160));

  const config: AppConfig = {
    ragThresholds: {
      greenMin: 70,
      amberMin: 40
    },
    ventures: [
      {
        ventureKey: "VENT-SVH",
        name: "SVH",
        departments: [
          { departmentKey: "POS-SVH-PRES", name: "President" },
          { departmentKey: "POS-SVH-CFO", name: "CFO" },
          { departmentKey: "POS-SVH-CIO", name: "CIO" }
        ]
      },
      {
        ventureKey: "VENT-EASE",
        name: "EASE Engineering",
        departments: [
          { departmentKey: "POS-EASE-CTO", name: "CTO" },
          { departmentKey: "POS-EASE-VPE", name: "VP Engineering" },
          { departmentKey: "POS-EASE-VPP", name: "VP Product" }
        ]
      },
      {
        ventureKey: "VENT-SINO",
        name: "Sino-Africa",
        departments: [
          { departmentKey: "POS-SINO-MD", name: "Managing Director" },
          { departmentKey: "POS-SINO-COMM", name: "Commercial Director" },
          { departmentKey: "POS-SINO-PART", name: "Partnerships Director" }
        ]
      }
    ]
  };

  const periods: Period[] = [
    {
      periodKey: "P-CURRENT",
      name: "Current Period",
      startDate: activePeriodStart,
      endDate: activePeriodEnd,
      status: "Active"
    },
    {
      periodKey: "P-NEXT",
      name: "Next Period",
      startDate: plannedPeriodStart,
      endDate: plannedPeriodEnd,
      status: "Planned"
    }
  ];

  const objectives: Objective[] = [
    {
      objectiveKey: "OKR-001",
      periodKey: "P-CURRENT",
      title: "Improve release reliability",
      description: "Reduce production incidents and improve rollback confidence.",
      owner: DEMO_OWNER,
      department: "VP Engineering",
      strategicTheme: "EASE Engineering",
      objectiveType: "Committed",
      okrCycle: "Q1",
      keyRisksDependency: "Large dependency upgrade still pending.",
      notes: "Focus on release safety and rollback confidence.",
      status: "OnTrack",
      progressPct: 0,
      confidence: "High",
      rag: "Green",
      startDate: activePeriodStart,
      endDate: activePeriodEnd,
      lastCheckinAt: null
    },
    {
      objectiveKey: "OKR-002",
      periodKey: "P-CURRENT",
      title: "Lift product adoption",
      description: "Increase activation and weekly usage of core workflows.",
      owner: "Priya Nair",
      department: "VP Product",
      strategicTheme: "EASE Engineering",
      objectiveType: "Aspirational",
      okrCycle: "Q1",
      keyRisksDependency: "Onboarding flow needs design rework.",
      notes: "Prioritize conversion and activation experiments.",
      status: "AtRisk",
      progressPct: 0,
      confidence: "Medium",
      rag: "Amber",
      startDate: activePeriodStart,
      endDate: activePeriodEnd,
      lastCheckinAt: null
    },
    {
      objectiveKey: "OKR-003",
      periodKey: "P-NEXT",
      title: "Prepare next quarter GTM launch",
      description: "Coordinate sales readiness and launch assets.",
      owner: DEMO_OWNER,
      department: "Commercial Director",
      strategicTheme: "Sino-Africa",
      objectiveType: "Learning",
      okrCycle: "Q2",
      keyRisksDependency: "",
      notes: "Collect GTM learnings ahead of launch window.",
      status: "NotStarted",
      progressPct: 0,
      confidence: "Medium",
      rag: "Amber",
      startDate: plannedPeriodStart,
      endDate: plannedPeriodEnd,
      lastCheckinAt: null
    },
    {
      objectiveKey: "OKR-004",
      periodKey: "P-CURRENT",
      title: "Drive group governance cadence",
      description: "Improve group-level planning and executive accountability rhythms.",
      owner: "Sarah Rahman",
      department: "President",
      strategicTheme: "SVH",
      objectiveType: "Committed",
      okrCycle: "Q1",
      keyRisksDependency: "Cross-team planning input is still inconsistent.",
      notes: "Track monthly governance packs and decision turnaround.",
      status: "OnTrack",
      progressPct: 0,
      confidence: "High",
      rag: "Green",
      startDate: activePeriodStart,
      endDate: activePeriodEnd,
      lastCheckinAt: null
    }
  ];

  const keyResults: KeyResult[] = [
    {
      krKey: "KR-001",
      objectiveKey: "OKR-001",
      periodKey: "P-CURRENT",
      title: "Cut Sev-1 incidents by 40%",
      owner: DEMO_OWNER,
      metricType: "Delivery",
      baselineValue: 0,
      targetValue: 40,
      currentValue: 21,
      progressPct: 0,
      status: "OnTrack",
      dueDate: toDateOnly(addDays(now, 40)),
      checkInFrequency: "Weekly",
      notes: "Primary indicator for production reliability improvements.",
      lastCheckinAt: addDays(now, -3).toISOString()
    },
    {
      krKey: "KR-002",
      objectiveKey: "OKR-001",
      periodKey: "P-CURRENT",
      title: "Reach 95% deployment success rate",
      owner: DEMO_OWNER,
      metricType: "Delivery",
      baselineValue: 60,
      targetValue: 95,
      currentValue: 74,
      progressPct: 0,
      status: "AtRisk",
      dueDate: toDateOnly(addDays(now, 55)),
      checkInFrequency: "Weekly",
      notes: "Track release quality trend from deployment pipeline data.",
      lastCheckinAt: addDays(now, -10).toISOString()
    },
    {
      krKey: "KR-003",
      objectiveKey: "OKR-002",
      periodKey: "P-CURRENT",
      title: "Increase weekly active teams to 120",
      owner: "Priya Nair",
      metricType: "People",
      baselineValue: 70,
      targetValue: 120,
      currentValue: 84,
      progressPct: 0,
      status: "AtRisk",
      dueDate: toDateOnly(addDays(now, 35)),
      checkInFrequency: "BiWeekly",
      notes: "Monitor adoption against onboarding and activation improvements.",
      lastCheckinAt: addDays(now, -6).toISOString()
    },
    {
      krKey: "KR-004",
      objectiveKey: "OKR-003",
      periodKey: "P-NEXT",
      title: "Publish 10 launch-ready assets",
      owner: DEMO_OWNER,
      metricType: "Delivery",
      baselineValue: 0,
      targetValue: 10,
      currentValue: 0,
      progressPct: 0,
      status: "NotStarted",
      dueDate: toDateOnly(addDays(now, 115)),
      checkInFrequency: "Monthly",
      notes: "Launch asset production tracker.",
      lastCheckinAt: null
    },
    {
      krKey: "KR-005",
      objectiveKey: "OKR-004",
      periodKey: "P-CURRENT",
      title: "Complete 12 monthly governance packs",
      owner: "Sarah Rahman",
      metricType: "Delivery",
      baselineValue: 0,
      targetValue: 12,
      currentValue: 8,
      progressPct: 0,
      status: "OnTrack",
      dueDate: toDateOnly(addDays(now, 62)),
      checkInFrequency: "Monthly",
      notes: "Board-level packs delivered with status and decisions.",
      lastCheckinAt: addDays(now, -5).toISOString()
    }
  ];

  keyResults.forEach((kr) => {
    kr.progressPct = computeKrProgress(kr.baselineValue, kr.targetValue, kr.currentValue);
  });

  const checkIns: CheckIn[] = [
    {
      checkInAt: addDays(now, -3).toISOString(),
      periodKey: "P-CURRENT",
      objectiveKey: "OKR-001",
      krKey: "KR-001",
      owner: DEMO_OWNER,
      status: "OnTrack",
      confidence: "High",
      updateNotes: "Rollbacks are fully automated in staging and partially in production.",
      blockers: "",
      supportNeeded: "Need SRE support for one final runbook.",
      currentValueSnapshot: 21,
      progressPctSnapshot: computeKrProgress(0, 40, 21),
      attachments: []
    },
    {
      checkInAt: addDays(now, -10).toISOString(),
      periodKey: "P-CURRENT",
      objectiveKey: "OKR-001",
      krKey: "KR-002",
      owner: DEMO_OWNER,
      status: "AtRisk",
      confidence: "Medium",
      updateNotes: "Deployment quality improved but incident trend still volatile.",
      blockers: "Large dependency upgrade still pending.",
      supportNeeded: "Prioritize platform migration window.",
      currentValueSnapshot: 74,
      progressPctSnapshot: computeKrProgress(60, 95, 74),
      attachments: []
    },
    {
      checkInAt: addDays(now, -6).toISOString(),
      periodKey: "P-CURRENT",
      objectiveKey: "OKR-002",
      krKey: "KR-003",
      owner: "Priya Nair",
      status: "AtRisk",
      confidence: "Low",
      updateNotes: "Top-of-funnel traffic is stable, but trial conversion has slowed.",
      blockers: "Onboarding flow needs design rework.",
      supportNeeded: "Design team support for experiment turnaround.",
      currentValueSnapshot: 84,
      progressPctSnapshot: computeKrProgress(70, 120, 84),
      attachments: []
    },
    {
      checkInAt: addDays(now, -5).toISOString(),
      periodKey: "P-CURRENT",
      objectiveKey: "OKR-004",
      krKey: "KR-005",
      owner: "Sarah Rahman",
      status: "OnTrack",
      confidence: "Medium",
      updateNotes: "Executive review pack cadence is stable and improving.",
      blockers: "",
      supportNeeded: "Need timely input from two departments before each board meeting.",
      currentValueSnapshot: 8,
      progressPctSnapshot: computeKrProgress(0, 12, 8),
      attachments: []
    }
  ];

  const store: StoreState = { config, periods, objectives, keyResults, checkIns };
  recalcAllObjectivesInStore(store);
  return store;
}

function applyStoreMigrations(store: StoreState): void {
  migrateSeedVentures(store);
  migrateObjectiveDefaults(store);
  migrateKrDefaults(store);
  persistStore(store);
}

function toStoreSnapshot(store: StoreState): StoreSnapshot {
  return {
    ventures: clone(store.config.ventures),
    content: {
      ragThresholds: clone(store.config.ragThresholds),
      periods: clone(store.periods),
      objectives: clone(store.objectives),
      keyResults: clone(store.keyResults),
      checkIns: clone(store.checkIns)
    }
  };
}

function fromStoreSnapshot(snapshot: StoreSnapshot): StoreState {
  const store = buildSeedStore();
  store.config.ventures = clone(snapshot.ventures);
  if (snapshot.content.ragThresholds) {
    store.config.ragThresholds = {
      greenMin: Number(snapshot.content.ragThresholds.greenMin),
      amberMin: Number(snapshot.content.ragThresholds.amberMin)
    };
  }

  store.periods = clone(snapshot.content.periods);
  store.objectives = clone(snapshot.content.objectives);
  store.keyResults = clone(snapshot.content.keyResults);
  store.checkIns = clone(snapshot.content.checkIns);
  return store;
}

export function getSeedSnapshot(): StoreSnapshot {
  const seed = buildSeedStore();
  applyStoreMigrations(seed);
  return toStoreSnapshot(seed);
}

export function hydrateStoreFromSnapshot(snapshot: StoreSnapshot): void {
  const hydrated = fromStoreSnapshot(snapshot);
  applyStoreMigrations(hydrated);
  storeContainer.__okrDummyStore = hydrated;
}

export function exportStoreSnapshot(): StoreSnapshot {
  return toStoreSnapshot(getStore());
}

export function resetStoreState(): void {
  storeContainer.__okrDummyStore = undefined;
}

function getStore(): StoreState {
  if (!storeContainer.__okrDummyStore) {
    storeContainer.__okrDummyStore = buildSeedStore();
  }

  const persistedVentures = readPersistedVentures();
  if (persistedVentures && persistedVentures.length > 0) {
    storeContainer.__okrDummyStore.config.ventures = persistedVentures;
  }

  const persistedContent = readPersistedContent();
  if (persistedContent) {
    if (persistedContent.ragThresholds) {
      storeContainer.__okrDummyStore.config.ragThresholds = {
        greenMin: Number(persistedContent.ragThresholds.greenMin),
        amberMin: Number(persistedContent.ragThresholds.amberMin)
      };
    }

    if (persistedContent.periods.length > 0) {
      storeContainer.__okrDummyStore.periods = persistedContent.periods;
    }

    storeContainer.__okrDummyStore.objectives = persistedContent.objectives;
    storeContainer.__okrDummyStore.keyResults = persistedContent.keyResults;
    storeContainer.__okrDummyStore.checkIns = persistedContent.checkIns;
  }

  applyStoreMigrations(storeContainer.__okrDummyStore);
  return storeContainer.__okrDummyStore;
}

function ensurePeriodExists(store: StoreState, periodKey: string): void {
  const exists = store.periods.some((period) => period.periodKey === periodKey);
  if (!exists) {
    throw new Error(`Period '${periodKey}' does not exist.`);
  }
}

function ensureObjectiveExists(store: StoreState, objectiveKey: string): Objective {
  const objective = store.objectives.find((item) => item.objectiveKey === objectiveKey);
  if (!objective) {
    throw new Error(`Objective '${objectiveKey}' does not exist.`);
  }

  return objective;
}

function ensureKrExists(store: StoreState, krKey: string): KeyResult {
  const kr = store.keyResults.find((item) => item.krKey === krKey);
  if (!kr) {
    throw new Error(`Key Result '${krKey}' does not exist.`);
  }

  return kr;
}

function isMatch(value: string, expected?: string): boolean {
  if (!expected) {
    return true;
  }

  return value.toLowerCase() === expected.toLowerCase();
}

function sortByDateDescending<T>(items: T[], selector: (item: T) => string): T[] {
  return [...items].sort((left, right) => selector(right).localeCompare(selector(left)));
}

export function getConfig(): AppConfig {
  return clone(getStore().config);
}

export function updateRagThresholds(input: RagThresholds): AppConfig {
  validateRagThresholds(input);
  const store = getStore();

  store.config.ragThresholds = {
    greenMin: Number(input.greenMin),
    amberMin: Number(input.amberMin)
  };

  recalcAllObjectivesInStore(store);
  persistStore(store);
  return clone(store.config);
}

export function addVenture(input: CreateVentureInput): Venture {
  const store = getStore();
  const name = normalizeName(input.name);

  if (!name) {
    throw new Error("Venture name is required.");
  }

  const duplicateName = store.config.ventures.some((venture) => venture.name.toLowerCase() === name.toLowerCase());
  if (duplicateName) {
    throw new Error(`Venture '${name}' already exists.`);
  }

  const existingVentureKeys = new Set(store.config.ventures.map((venture) => venture.ventureKey.toLowerCase()));
  const requestedVentureKey = normalizeKey(input.ventureKey ?? "");
  let ventureKey = requestedVentureKey;

  if (requestedVentureKey) {
    const duplicate = findVentureByKey(store, requestedVentureKey);
    if (duplicate) {
      throw new Error(`Venture '${requestedVentureKey}' already exists.`);
    }
  } else {
    ventureKey = buildUniqueKey(existingVentureKeys, "VENT", name);
  }

  const departments: Department[] = [];
  const rawDepartments = input.departments ?? [];
  const departmentKeys = new Set<string>();
  const departmentNames = new Set<string>();

  rawDepartments.forEach((department) => {
    const departmentName = normalizeName(department.name);
    const requestedDepartmentKey = normalizeKey(department.departmentKey ?? "");
    let departmentKey = requestedDepartmentKey;

    if (!departmentName) {
      throw new Error("Department name is required.");
    }

    if (departmentNames.has(departmentName.toLowerCase())) {
      throw new Error(`Duplicate department name '${departmentName}' in venture payload.`);
    }

    if (requestedDepartmentKey) {
      if (departmentKeys.has(requestedDepartmentKey.toLowerCase())) {
        throw new Error(`Duplicate department key '${requestedDepartmentKey}' in venture payload.`);
      }
    } else {
      departmentKey = buildUniqueKey(departmentKeys, "DEP", departmentName);
    }

    departmentKeys.add(departmentKey.toLowerCase());
    departmentNames.add(departmentName.toLowerCase());
    departments.push({ departmentKey, name: departmentName });
  });

  const venture: Venture = {
    ventureKey,
    name,
    departments
  };

  store.config.ventures.push(venture);
  persistStore(store);
  return clone(venture);
}

export function updateVenture(ventureKey: string, patch: UpdateVentureInput): Venture | null {
  const store = getStore();
  const venture = findVentureByKey(store, ventureKey);

  if (!venture) {
    return null;
  }

  if (patch.name !== undefined) {
    const name = normalizeName(patch.name);
    if (!name) {
      throw new Error("Venture name cannot be empty.");
    }

    const duplicateName = store.config.ventures.some(
      (item) => item.ventureKey.toLowerCase() !== venture.ventureKey.toLowerCase() && item.name.toLowerCase() === name.toLowerCase()
    );

    if (duplicateName) {
      throw new Error(`Venture '${name}' already exists.`);
    }

    venture.name = name;
  }

  persistStore(store);
  return clone(venture);
}

export function deleteVenture(ventureKey: string): boolean {
  const store = getStore();
  const index = store.config.ventures.findIndex(
    (venture) => venture.ventureKey.toLowerCase() === ventureKey.toLowerCase()
  );

  if (index < 0) {
    return false;
  }

  const venture = store.config.ventures[index];
  const ventureDepartments = new Set(venture.departments.map((department) => department.name.toLowerCase()));
  const removedObjectiveKeys = new Set(
    store.objectives
      .filter((objective) => ventureDepartments.has(objective.department.toLowerCase()))
      .map((objective) => objective.objectiveKey.toLowerCase())
  );
  const removedKrKeys = new Set(
    store.keyResults
      .filter((keyResult) => removedObjectiveKeys.has(keyResult.objectiveKey.toLowerCase()))
      .map((keyResult) => keyResult.krKey.toLowerCase())
  );

  store.config.ventures.splice(index, 1);
  store.objectives = store.objectives.filter((objective) => !removedObjectiveKeys.has(objective.objectiveKey.toLowerCase()));
  store.keyResults = store.keyResults.filter((keyResult) => !removedKrKeys.has(keyResult.krKey.toLowerCase()));
  store.checkIns = store.checkIns.filter((checkIn) => {
    return !removedObjectiveKeys.has(checkIn.objectiveKey.toLowerCase()) && !removedKrKeys.has(checkIn.krKey.toLowerCase());
  });

  persistStore(store);
  return true;
}

export function addDepartmentToVenture(ventureKey: string, input: CreateDepartmentInput): Venture | null {
  const store = getStore();
  const venture = findVentureByKey(store, ventureKey);

  if (!venture) {
    return null;
  }

  const name = normalizeName(input.name);
  const requestedDepartmentKey = normalizeKey(input.departmentKey ?? "");
  let departmentKey = requestedDepartmentKey;

  if (!name) {
    throw new Error("Department name is required.");
  }

  const duplicateName = venture.departments.some((department) => department.name.toLowerCase() === name.toLowerCase());
  if (duplicateName) {
    throw new Error(`Department '${name}' already exists in venture '${venture.name}'.`);
  }

  const existingDepartmentKeys = new Set(venture.departments.map((department) => department.departmentKey.toLowerCase()));
  if (requestedDepartmentKey) {
    if (existingDepartmentKeys.has(requestedDepartmentKey.toLowerCase())) {
      throw new Error(`Department '${requestedDepartmentKey}' already exists in venture '${venture.ventureKey}'.`);
    }
  } else {
    departmentKey = buildUniqueKey(existingDepartmentKeys, "DEP", name);
  }

  venture.departments.push({ departmentKey, name });
  persistStore(store);
  return clone(venture);
}

export function updateDepartmentInVenture(
  ventureKey: string,
  departmentKey: string,
  patch: UpdateDepartmentInput
): Venture | null {
  const store = getStore();
  const venture = findVentureByKey(store, ventureKey);

  if (!venture) {
    return null;
  }

  const department = findDepartmentByKey(venture, departmentKey);
  if (!department) {
    return null;
  }

  if (patch.name !== undefined) {
    const name = normalizeName(patch.name);
    if (!name) {
      throw new Error("Department name cannot be empty.");
    }

    const duplicateName = venture.departments.some(
      (item) =>
        item.departmentKey.toLowerCase() !== department.departmentKey.toLowerCase() &&
        item.name.toLowerCase() === name.toLowerCase()
    );

    if (duplicateName) {
      throw new Error(`Department '${name}' already exists in venture '${venture.name}'.`);
    }

    const oldName = department.name;
    department.name = name;

    store.objectives.forEach((objective) => {
      if (objective.department.toLowerCase() === oldName.toLowerCase()) {
        objective.department = name;
      }
    });
  }

  persistStore(store);
  return clone(venture);
}

export function deleteDepartmentFromVenture(ventureKey: string, departmentKey: string): Venture | null {
  const store = getStore();
  const venture = findVentureByKey(store, ventureKey);

  if (!venture) {
    return null;
  }

  const index = venture.departments.findIndex(
    (department) => department.departmentKey.toLowerCase() === departmentKey.toLowerCase()
  );

  if (index < 0) {
    return null;
  }

  const department = venture.departments[index];
  ensureNoObjectiveUsesDepartment(store, department.name);
  venture.departments.splice(index, 1);

  persistStore(store);
  return clone(venture);
}

export function listPeriods(): Period[] {
  return clone(getStore().periods);
}

export function createPeriod(input: CreatePeriodInput): Period {
  const store = getStore();
  const alreadyExists = store.periods.some((period) => period.periodKey === input.periodKey);

  if (alreadyExists) {
    throw new Error(`Period '${input.periodKey}' already exists.`);
  }

  const period: Period = {
    periodKey: input.periodKey,
    name: input.name,
    startDate: input.startDate,
    endDate: input.endDate,
    status: input.status ?? "Planned"
  };

  store.periods.push(period);
  persistStore(store);
  return clone(period);
}

export function updatePeriod(periodKey: string, patch: Partial<Period>): Period | null {
  const store = getStore();
  const period = store.periods.find((item) => item.periodKey === periodKey);

  if (!period) {
    return null;
  }

  Object.assign(period, patch);
  persistStore(store);
  return clone(period);
}

type ObjectiveFilters = {
  periodKey?: string;
  department?: string;
  owner?: string;
  status?: string;
};

export function listObjectives(filters: ObjectiveFilters = {}): Objective[] {
  const { periodKey, department, owner, status } = filters;
  const objectives = getStore().objectives.filter((objective) => {
    return (
      isMatch(objective.periodKey, periodKey) &&
      isMatch(objective.department, department) &&
      isMatch(objective.owner, owner) &&
      isMatch(objective.status, status)
    );
  });

  return clone(objectives);
}

export function getObjective(objectiveKey: string): Objective | null {
  const objective = getStore().objectives.find((item) => item.objectiveKey === objectiveKey);
  return objective ? clone(objective) : null;
}

export function getObjectiveWithContext(objectiveKey: string): ObjectiveWithContext | null {
  const store = getStore();
  const objective = store.objectives.find((item) => item.objectiveKey === objectiveKey);

  if (!objective) {
    return null;
  }

  const objectiveKrs = store.keyResults.filter((kr) => kr.objectiveKey === objectiveKey);
  const latestCheckIns: Record<string, CheckIn | null> = {};

  objectiveKrs.forEach((kr) => {
    const latest = sortByDateDescending(
      store.checkIns.filter((checkIn) => checkIn.krKey === kr.krKey),
      (checkIn) => checkIn.checkInAt
    )[0];

    latestCheckIns[kr.krKey] = latest ?? null;
  });

  return clone({
    objective,
    keyResults: objectiveKrs,
    latestCheckIns
  });
}

export function createObjective(input: CreateObjectiveInput): Objective {
  const store = getStore();
  const requestedObjectiveCode = normalizeKey(input.objectiveCode ?? input.objectiveKey ?? "");
  const existingKeys = new Set(store.objectives.map((objective) => objective.objectiveKey.toLowerCase()));
  const objectiveKey = buildUniqueKey(existingKeys, "OKR", input.title);

  ensurePeriodExists(store, input.periodKey);
  assertDepartmentExists(store, input.department);
  const strategicTheme = normalizeName(input.strategicTheme || "");
  const blockers = normalizeName(input.blockers || "");
  const notes = normalizeName(input.notes || input.description || "");
  const cycle = normalizeOkrCycle(input.okrCycle);

  const objective: Objective = {
    objectiveKey,
    objectiveCode:
      requestedObjectiveCode || getNextObjectiveCode(store, input.department, input.ventureName ?? "", input.strategicTheme),
    periodKey: input.periodKey,
    title: input.title,
    description: input.description || notes,
    owner: input.owner,
    ownerEmail: normalizeEmail(input.ownerEmail ?? "") || undefined,
    department: input.department,
    ventureName: input.ventureName ?? findVentureForObjectiveScope(store, input.department, "", input.strategicTheme)?.name ?? "",
    strategicTheme: strategicTheme || "General",
    objectiveType: (input.objectiveType ?? "Committed") as ObjectiveType,
    okrCycle: cycle,
    blockers,
    keyRisksDependency: input.keyRisksDependency || "",
    notes,
    status: input.status,
    progressPct: input.progressPct ?? 0,
    confidence: input.confidence,
    rag: input.rag,
    startDate: input.startDate,
    endDate: input.endDate,
    lastCheckinAt: nowIso()
  };

  store.objectives.push(objective);
  recalcObjectiveInStore(store, objective.objectiveKey);
  persistStore(store);
  return clone(objective);
}

export function updateObjective(objectiveKey: string, patch: UpdateObjectiveInput): Objective | null {
  const store = getStore();
  const objective = store.objectives.find((item) => item.objectiveKey === objectiveKey);

  if (!objective) {
    return null;
  }

  if (patch.periodKey !== undefined) {
    ensurePeriodExists(store, patch.periodKey);
    objective.periodKey = patch.periodKey;
  }

  if (patch.objectiveCode !== undefined) {
    objective.objectiveCode = normalizeKey(patch.objectiveCode) || objective.objectiveKey;
  }

  if (patch.title !== undefined) {
    objective.title = normalizeName(patch.title);
  }

  if (patch.description !== undefined) {
    objective.description = normalizeName(patch.description);
  }

  if (patch.owner !== undefined) {
    objective.owner = normalizeName(patch.owner);
  }

  if (patch.ownerEmail !== undefined) {
    objective.ownerEmail = normalizeEmail(patch.ownerEmail) || undefined;
  }

  if (patch.department !== undefined) {
    objective.department = normalizeName(patch.department);
  }

  if (patch.ventureName !== undefined) {
    objective.ventureName = normalizeName(patch.ventureName);
  }

  if (patch.strategicTheme !== undefined) {
    objective.strategicTheme = normalizeName(patch.strategicTheme);
  }

  if (patch.objectiveType !== undefined) {
    objective.objectiveType = patch.objectiveType;
  }

  if (patch.okrCycle !== undefined) {
    objective.okrCycle = normalizeOkrCycle(patch.okrCycle);
  }

  if (patch.blockers !== undefined) {
    objective.blockers = normalizeName(patch.blockers);
  }

  if (patch.keyRisksDependency !== undefined) {
    objective.keyRisksDependency = normalizeName(patch.keyRisksDependency);
  }

  if (patch.notes !== undefined) {
    objective.notes = normalizeName(patch.notes);
  }

  if (patch.status !== undefined) {
    objective.status = patch.status;
  }

  if (patch.confidence !== undefined) {
    objective.confidence = patch.confidence;
  }

  if (patch.progressPct !== undefined) {
    objective.progressPct = clampPercent(patch.progressPct);
    objective.rag = getRagFromProgress(objective.progressPct, store.config.ragThresholds);
  }

  if (patch.startDate !== undefined) {
    objective.startDate = normalizeName(patch.startDate);
  }

  if (patch.endDate !== undefined) {
    objective.endDate = normalizeName(patch.endDate);
  }

  if (patch.progressPct === undefined) {
    recalcObjectiveInStore(store, objective.objectiveKey);
  }

  objective.lastCheckinAt = nowIso();

  persistStore(store);
  return clone(objective);
}

export function deleteObjective(
  objectiveKey: string
): { objectiveKey: string; deletedKrCount: number; deletedCheckInCount: number } | null {
  const store = getStore();
  const objectiveIndex = store.objectives.findIndex(
    (objective) => objective.objectiveKey.toLowerCase() === objectiveKey.toLowerCase()
  );

  if (objectiveIndex < 0) {
    return null;
  }

  const objective = store.objectives[objectiveIndex];
  const relatedKrs = store.keyResults.filter(
    (keyResult) => keyResult.objectiveKey.toLowerCase() === objective.objectiveKey.toLowerCase()
  );
  const relatedKrKeys = new Set(relatedKrs.map((keyResult) => keyResult.krKey.toLowerCase()));

  const deletedKrCount = relatedKrs.length;
  const deletedCheckInCount = store.checkIns.filter((checkIn) => {
    return (
      checkIn.objectiveKey.toLowerCase() === objective.objectiveKey.toLowerCase() ||
      relatedKrKeys.has(checkIn.krKey.toLowerCase())
    );
  }).length;

  store.objectives.splice(objectiveIndex, 1);
  store.keyResults = store.keyResults.filter(
    (keyResult) => keyResult.objectiveKey.toLowerCase() !== objective.objectiveKey.toLowerCase()
  );
  store.checkIns = store.checkIns.filter((checkIn) => {
    return (
      checkIn.objectiveKey.toLowerCase() !== objective.objectiveKey.toLowerCase() &&
      !relatedKrKeys.has(checkIn.krKey.toLowerCase())
    );
  });

  persistStore(store);
  return {
    objectiveKey: objective.objectiveKey,
    deletedKrCount,
    deletedCheckInCount
  };
}

type KrFilters = {
  periodKey?: string;
  objectiveKey?: string;
  owner?: string;
  status?: string;
};

export function listKeyResults(filters: KrFilters = {}): KeyResult[] {
  const { periodKey, objectiveKey, owner, status } = filters;

  const keyResults = getStore().keyResults.filter((kr) => {
    return (
      isMatch(kr.periodKey, periodKey) &&
      isMatch(kr.objectiveKey, objectiveKey) &&
      isMatch(kr.owner, owner) &&
      isMatch(kr.status, status)
    );
  });

  return clone(keyResults);
}

export function getKeyResult(krKey: string): KeyResult | null {
  const kr = getStore().keyResults.find((item) => item.krKey === krKey);
  return kr ? clone(kr) : null;
}

export function createKeyResult(input: CreateKeyResultInput): KeyResult {
  const store = getStore();
  const requestedKrCode = normalizeKey(input.krCode ?? input.krKey ?? "");
  const existingKeys = new Set(store.keyResults.map((kr) => kr.krKey.toLowerCase()));
  const krKey = buildUniqueKey(existingKeys, "KR", input.title);

  const objective = ensureObjectiveExists(store, input.objectiveKey);
  ensurePeriodExists(store, input.periodKey);

  const progressPct =
    input.progressPct ?? computeKrProgress(input.baselineValue, input.targetValue, input.currentValue);
  const checkInFrequency = normalizeCheckInFrequency(input.checkInFrequency);
  const blockers = normalizeName(input.blockers ?? "");
  const notes = normalizeName(input.notes ?? "");

  const keyResult: KeyResult = {
    krKey,
    krCode: requestedKrCode || getNextKrCode(store, input.objectiveKey),
    objectiveKey: input.objectiveKey,
    periodKey: input.periodKey,
    title: input.title,
    owner: input.owner,
    ownerEmail: normalizeEmail(input.ownerEmail ?? "") || undefined,
    metricType: normalizeMetricType(input.metricType),
    baselineValue: input.baselineValue,
    targetValue: input.targetValue,
    currentValue: input.currentValue,
    progressPct,
    status: input.status,
    dueDate: input.dueDate,
    checkInFrequency,
    blockers,
    notes,
    lastCheckinAt: nowIso()
  };

  store.keyResults.push(keyResult);
  recalcObjectiveInStore(store, objective.objectiveKey);
  persistStore(store);
  return clone(keyResult);
}

export function previewNextObjectiveCode(departmentName: string, ventureName: string, strategicTheme: string): string {
  const store = getStore();
  return getNextObjectiveCode(store, departmentName, ventureName, strategicTheme);
}

export function previewNextKrCode(objectiveKey: string): string {
  const store = getStore();
  return getNextKrCode(store, objectiveKey);
}

export function updateKeyResult(krKey: string, patch: UpdateKeyResultInput): KeyResult | null {
  const store = getStore();
  const keyResult = store.keyResults.find((item) => item.krKey === krKey);

  if (!keyResult) {
    return null;
  }

  const previousObjectiveKey = keyResult.objectiveKey;

  if (patch.periodKey !== undefined) {
    ensurePeriodExists(store, patch.periodKey);
    keyResult.periodKey = patch.periodKey;
  }

  if (patch.objectiveKey !== undefined) {
    ensureObjectiveExists(store, patch.objectiveKey);
    keyResult.objectiveKey = patch.objectiveKey;
  }

  if (patch.krCode !== undefined) {
    keyResult.krCode = normalizeKey(patch.krCode) || keyResult.krKey;
  }

  if (patch.title !== undefined) {
    keyResult.title = normalizeName(patch.title);
  }

  if (patch.owner !== undefined) {
    keyResult.owner = normalizeName(patch.owner);
  }

  if (patch.ownerEmail !== undefined) {
    keyResult.ownerEmail = normalizeEmail(patch.ownerEmail) || undefined;
  }

  if (patch.metricType !== undefined) {
    keyResult.metricType = normalizeMetricType(patch.metricType);
  }

  if (patch.baselineValue !== undefined) {
    keyResult.baselineValue = patch.baselineValue;
  }

  if (patch.targetValue !== undefined) {
    keyResult.targetValue = patch.targetValue;
  }

  if (patch.currentValue !== undefined) {
    keyResult.currentValue = patch.currentValue;
  }

  if (patch.status !== undefined) {
    keyResult.status = patch.status;
  }

  if (patch.dueDate !== undefined) {
    keyResult.dueDate = normalizeName(patch.dueDate);
  }

  if (patch.checkInFrequency !== undefined) {
    keyResult.checkInFrequency = normalizeCheckInFrequency(patch.checkInFrequency);
  }

  if (patch.blockers !== undefined) {
    keyResult.blockers = normalizeName(patch.blockers);
  }

  if (patch.notes !== undefined) {
    keyResult.notes = normalizeName(patch.notes);
  }

  keyResult.progressPct = computeKrProgress(keyResult.baselineValue, keyResult.targetValue, keyResult.currentValue);

  if (patch.status === undefined) {
    keyResult.status = getStatusFromProgress(keyResult.progressPct);
  }

  keyResult.lastCheckinAt = nowIso();

  if (previousObjectiveKey.toLowerCase() !== keyResult.objectiveKey.toLowerCase()) {
    store.checkIns.forEach((checkIn) => {
      if (checkIn.krKey.toLowerCase() === keyResult.krKey.toLowerCase()) {
        checkIn.objectiveKey = keyResult.objectiveKey;
      }
    });

    recalcObjectiveInStore(store, previousObjectiveKey);
  }

  recalcObjectiveInStore(store, keyResult.objectiveKey);
  persistStore(store);
  return clone(keyResult);
}

export function deleteKeyResult(krKey: string): { krKey: string; deletedCheckInCount: number } | null {
  const store = getStore();
  const krIndex = store.keyResults.findIndex((keyResult) => keyResult.krKey.toLowerCase() === krKey.toLowerCase());

  if (krIndex < 0) {
    return null;
  }

  const keyResult = store.keyResults[krIndex];
  const deletedCheckInCount = store.checkIns.filter(
    (checkIn) => checkIn.krKey.toLowerCase() === keyResult.krKey.toLowerCase()
  ).length;

  store.keyResults.splice(krIndex, 1);
  store.checkIns = store.checkIns.filter((checkIn) => checkIn.krKey.toLowerCase() !== keyResult.krKey.toLowerCase());
  recalcObjectiveInStore(store, keyResult.objectiveKey);

  persistStore(store);
  return {
    krKey: keyResult.krKey,
    deletedCheckInCount
  };
}

type CheckInFilters = {
  periodKey?: string;
  objectiveKey?: string;
  krKey?: string;
  owner?: string;
};

type DashboardFilters = {
  ventureKey?: string;
  department?: string;
};

export function listCheckIns(filters: CheckInFilters = {}): CheckIn[] {
  const { periodKey, objectiveKey, krKey, owner } = filters;

  const checkIns = getStore().checkIns.filter((checkIn) => {
    return (
      isMatch(checkIn.periodKey, periodKey) &&
      isMatch(checkIn.objectiveKey, objectiveKey) &&
      isMatch(checkIn.krKey, krKey) &&
      isMatch(checkIn.owner, owner)
    );
  });

  return clone(sortByDateDescending(checkIns, (checkIn) => checkIn.checkInAt));
}

export function createCheckIn(input: CreateCheckInInput): CheckIn {
  const store = getStore();
  ensurePeriodExists(store, input.periodKey);
  const objective = ensureObjectiveExists(store, input.objectiveKey);
  const keyResult = ensureKrExists(store, input.krKey);

  if (keyResult.objectiveKey !== objective.objectiveKey) {
    throw new Error("KR does not belong to the provided objective.");
  }

  if (keyResult.periodKey !== input.periodKey) {
    throw new Error("KR period does not match the provided period.");
  }

  const checkInAt = input.checkInAt ?? nowIso();
  const currentValueSnapshot = input.currentValueSnapshot;
  const progressPctSnapshot =
    input.progressPctSnapshot ??
    computeKrProgress(keyResult.baselineValue, keyResult.targetValue, currentValueSnapshot);

  const status = input.status;
  const checkIn: CheckIn = {
    checkInAt,
    periodKey: input.periodKey,
    objectiveKey: input.objectiveKey,
    krKey: input.krKey,
    owner: input.owner,
    status,
    confidence: input.confidence,
    updateNotes: input.updateNotes,
    blockers: input.blockers,
    supportNeeded: input.supportNeeded,
    currentValueSnapshot,
    progressPctSnapshot,
    attachments: input.attachments
  };

  store.checkIns.push(checkIn);

  keyResult.currentValue = currentValueSnapshot;
  keyResult.progressPct = progressPctSnapshot;
  keyResult.status = status;
  keyResult.blockers = normalizeName(input.blockers);
  keyResult.notes = normalizeName(input.updateNotes);
  keyResult.lastCheckinAt = checkInAt;

  recalcObjectiveInStore(store, keyResult.objectiveKey);
  persistStore(store);
  return clone(checkIn);
}

function isDepartmentInVenture(venture: Venture, departmentName: string): boolean {
  return venture.departments.some((department) => department.name.toLowerCase() === departmentName.toLowerCase());
}

export function getDashboardForOwner(owner: string = DEMO_OWNER, filters: DashboardFilters = {}): DashboardMe {
  const store = getStore();
  const normalizedOwner = owner.toLowerCase();
  const { ventureKey, department } = filters;
  const selectedVenture = ventureKey ? findVentureByKey(store, ventureKey) : undefined;
  const isInvalidVentureFilter = Boolean(ventureKey && !selectedVenture);

  const matchesVentureDepartmentFilter = (objective: Objective): boolean => {
    if (isInvalidVentureFilter) {
      return false;
    }

    if (department && objective.department.toLowerCase() !== department.toLowerCase()) {
      return false;
    }

    if (selectedVenture && !isDepartmentInVenture(selectedVenture, objective.department)) {
      return false;
    }

    return true;
  };

  const myObjectives = store.objectives.filter((objective) => {
    if (objective.owner.toLowerCase() !== normalizedOwner) {
      return false;
    }

    return matchesVentureDepartmentFilter(objective);
  });

  const objectiveByKey = new Map(
    store.objectives.map((objective) => [objective.objectiveKey.toLowerCase(), objective] as const)
  );

  const myKeyResults = store.keyResults.filter((kr) => {
    if (kr.owner.toLowerCase() !== normalizedOwner) {
      return false;
    }

    const objective = objectiveByKey.get(kr.objectiveKey.toLowerCase());
    if (!objective) {
      return false;
    }

    return matchesVentureDepartmentFilter(objective);
  });
  const periodMap = new Map(store.periods.map((period) => [period.periodKey, period]));

  const missingCheckIns = myKeyResults.filter((kr) => {
    const period = periodMap.get(kr.periodKey);
    if (!period) {
      return false;
    }

    return isMissingCheckin(kr.lastCheckinAt, period.status);
  });

  const atRiskObjectives = myObjectives.filter((objective) => {
    return objective.rag !== "Green" || objective.status === "AtRisk" || objective.status === "OffTrack";
  });

  return clone({
    owner,
    myObjectives,
    myKeyResults,
    missingCheckIns,
    atRiskObjectives
  });
}

