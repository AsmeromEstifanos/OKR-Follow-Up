export type PeriodStatus = "Planned" | "Active" | "Closed";
export type ObjectiveStatus = "NotStarted" | "OnTrack" | "AtRisk" | "OffTrack" | "Done";
export type ObjectiveType = "Aspirational" | "Committed" | "Learning";
export type OkrCycle = "Q1" | "Q2" | "Q3" | "Q4";
export type KrStatus = "NotStarted" | "OnTrack" | "AtRisk" | "OffTrack" | "Done";
export type CheckInFrequency = "Weekly" | "BiWeekly" | "Monthly" | "AdHoc";
export type Confidence = "High" | "Medium" | "Low";
export type Rag = "Green" | "Amber" | "Red";
export type MetricType = "Delivery" | "Financial" | "Operational" | "People" | "Quality";

export interface RagThresholds {
  greenMin: number;
  amberMin: number;
}

export interface Department {
  departmentKey: string;
  name: string;
}

export interface Venture {
  ventureKey: string;
  name: string;
  departments: Department[];
}

export interface AppConfig {
  ragThresholds: RagThresholds;
  ventures: Venture[];
}

export interface Period {
  periodKey: string;
  name: string;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
}

export interface Objective {
  objectiveKey: string;
  periodKey: string;
  title: string;
  description: string;
  owner: string;
  department: string;
  strategicTheme: string;
  objectiveType: ObjectiveType;
  okrCycle: OkrCycle;
  keyRisksDependency: string;
  notes: string;
  status: ObjectiveStatus;
  progressPct: number;
  confidence: Confidence;
  rag: Rag;
  startDate: string;
  endDate: string;
  lastCheckinAt: string | null;
}

export interface KeyResult {
  krKey: string;
  objectiveKey: string;
  periodKey: string;
  title: string;
  owner: string;
  metricType: MetricType;
  baselineValue: number;
  targetValue: number;
  currentValue: number;
  progressPct: number;
  status: KrStatus;
  dueDate: string;
  checkInFrequency: CheckInFrequency;
  notes: string;
  lastCheckinAt: string | null;
}

export interface CheckIn {
  checkInAt: string;
  periodKey: string;
  objectiveKey: string;
  krKey: string;
  owner: string;
  status: KrStatus;
  confidence: Confidence;
  updateNotes: string;
  blockers: string;
  supportNeeded: string;
  currentValueSnapshot: number;
  progressPctSnapshot: number;
  attachments: string[];
}

export interface DashboardMe {
  owner: string;
  myObjectives: Objective[];
  myKeyResults: KeyResult[];
  missingCheckIns: KeyResult[];
  atRiskObjectives: Objective[];
}

export interface ObjectiveWithContext {
  objective: Objective;
  keyResults: KeyResult[];
  latestCheckIns: Record<string, CheckIn | null>;
}

export type CreatePeriodInput = Omit<Period, "status"> & { status?: PeriodStatus };
export type CreateObjectiveInput = Omit<Objective, "objectiveKey" | "progressPct" | "lastCheckinAt"> & {
  objectiveKey?: string;
  progressPct?: number;
  lastCheckinAt?: string | null;
};
export type UpdateObjectiveInput = Partial<
  Pick<
    Objective,
    | "periodKey"
    | "title"
    | "description"
    | "owner"
    | "department"
    | "strategicTheme"
    | "objectiveType"
    | "okrCycle"
    | "keyRisksDependency"
    | "notes"
    | "status"
    | "confidence"
    | "progressPct"
    | "startDate"
    | "endDate"
    | "lastCheckinAt"
  >
>;
export type CreateKeyResultInput = Omit<KeyResult, "krKey" | "progressPct" | "lastCheckinAt" | "checkInFrequency" | "notes"> & {
  krKey?: string;
  progressPct?: number;
  checkInFrequency?: CheckInFrequency;
  notes?: string;
  lastCheckinAt?: string | null;
};
export type UpdateKeyResultInput = Partial<
  Pick<
    KeyResult,
    | "objectiveKey"
    | "periodKey"
    | "title"
    | "owner"
    | "metricType"
    | "baselineValue"
    | "targetValue"
    | "currentValue"
    | "status"
    | "dueDate"
    | "checkInFrequency"
    | "notes"
    | "lastCheckinAt"
  >
>;
export type CreateCheckInInput = Omit<CheckIn, "checkInAt" | "progressPctSnapshot"> & {
  checkInAt?: string;
  progressPctSnapshot?: number;
};

export type CreateVentureInput = {
  ventureKey?: string;
  name: string;
  departments?: Array<{
    departmentKey?: string;
    name: string;
  }>;
};

export type UpdateVentureInput = Partial<Pick<Venture, "name">>;

export type CreateDepartmentInput = {
  departmentKey?: string;
  name: string;
};

export type UpdateDepartmentInput = Partial<Pick<Department, "name">>;
