"use client";

import OwnerInput from "@/app/owner-input";
import type {
  AppConfig,
  CheckInFrequency,
  KeyResult,
  MetricType,
  Objective,
  ObjectiveStatus,
  ObjectiveType,
  OkrCycle,
  Period,
  KrStatus
} from "@/lib/types";
import { apiPath } from "@/lib/base-path";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type ApiError = {
  error?: string;
};

type OwnerSuggestion = {
  displayName: string;
  principalName: string;
  mail: string;
};

type CreateMode = "none" | "objective" | "kr";

const OBJECTIVE_TYPE_OPTIONS: ObjectiveType[] = ["Aspirational", "Committed", "Learning"];
const HEALTH_STATUS_OPTIONS: ObjectiveStatus[] = ["OnTrack", "OffTrack", "Done", "AtRisk"];
const KR_HEALTH_OPTIONS: KrStatus[] = ["OnTrack", "OffTrack", "Done", "AtRisk"];
const OKR_CYCLE_OPTIONS: OkrCycle[] = ["Q1", "Q2", "Q3", "Q4"];
const CHECKIN_FREQUENCY_OPTIONS: CheckInFrequency[] = ["Weekly", "BiWeekly", "Monthly", "AdHoc"];

function getCurrentCycle(): OkrCycle {
  const quarter = Math.floor(new Date().getMonth() / 3) + 1;
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

function getCycleDateRange(cycle: OkrCycle): { startDate: string; endDate: string } {
  const year = new Date().getFullYear();
  const quarterStartMonth = cycle === "Q1" ? 0 : cycle === "Q2" ? 3 : cycle === "Q3" ? 6 : 9;
  const startDate = new Date(year, quarterStartMonth, 1);
  const endDate = new Date(year, quarterStartMonth + 3, 0);

  return {
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10)
  };
}

function pickDefaultPeriod(periods: Period[]): Period | undefined {
  return periods.find((period) => period.status === "Active") ?? periods[0];
}

function parseProgressValue(value: string): { current: number; target: number } | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split("/").map((part) => Number(part.trim()));
  if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
    return null;
  }

  const [current, target] = parts;
  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) {
    return null;
  }

  return { current, target };
}

async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function formatStatusLabel(value: ObjectiveStatus | KrStatus): string {
  if (value === "OnTrack") {
    return "On Track";
  }

  if (value === "AtRisk") {
    return "At Risk";
  }

  if (value === "OffTrack") {
    return "Off Track";
  }

  if (value === "NotStarted") {
    return "Not Started";
  }

  return value;
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Never";
  }

  return new Date(value).toLocaleDateString();
}

function formatMetricValue(value: number, metricType: MetricType): string {
  void metricType;
  return value.toLocaleString();
}

function clampProgressPct(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, value));
}

export default function DashboardCreateControls(): JSX.Element {
  const router = useRouter();
  const [mode, setMode] = useState<CreateMode>("none");
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [message, setMessage] = useState<string>("");

  const [periods, setPeriods] = useState<Period[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);

  const [objectiveCodePreview, setObjectiveCodePreview] = useState<string>("");
  const [objectiveTitle, setObjectiveTitle] = useState<string>("");
  const [objectiveOwner, setObjectiveOwner] = useState<string>("");
  const [objectiveOwnerEmail, setObjectiveOwnerEmail] = useState<string>("");
  const [objectiveVenture, setObjectiveVenture] = useState<string>("");
  const [objectiveStrategicTheme, setObjectiveStrategicTheme] = useState<string>("");
  const [objectiveDepartment, setObjectiveDepartment] = useState<string>("");
  const [objectiveType, setObjectiveType] = useState<ObjectiveType>("Committed");
  const [objectiveStatus, setObjectiveStatus] = useState<ObjectiveStatus>("OnTrack");
  const [objectiveCycle, setObjectiveCycle] = useState<OkrCycle>(getCurrentCycle());
  const [objectiveProgress, setObjectiveProgress] = useState<string>("0 / 100");
  const [objectiveProgressPct, setObjectiveProgressPct] = useState<string>("0");
  const [objectiveBlockers, setObjectiveBlockers] = useState<string>("");
  const [objectiveKeyRisksDependency, setObjectiveKeyRisksDependency] = useState<string>("");
  const [objectiveNotes, setObjectiveNotes] = useState<string>("");

  const [krCodePreview, setKrCodePreview] = useState<string>("");
  const [krObjectiveKey, setKrObjectiveKey] = useState<string>("");
  const [krTitle, setKrTitle] = useState<string>("");
  const [krOwner, setKrOwner] = useState<string>("");
  const [krOwnerEmail, setKrOwnerEmail] = useState<string>("");
  const [krStatus, setKrStatus] = useState<KrStatus>("OnTrack");
  const [krProgress, setKrProgress] = useState<string>("0 / 100");
  const [krProgressPct, setKrProgressPct] = useState<string>("0");
  const [krCheckInFrequency, setKrCheckInFrequency] = useState<CheckInFrequency>("Weekly");
  const [krBlockers, setKrBlockers] = useState<string>("");
  const [krNotes, setKrNotes] = useState<string>("");
  const [existingKrs, setExistingKrs] = useState<KeyResult[]>([]);
  const [existingKrsLoading, setExistingKrsLoading] = useState<boolean>(false);
  const [existingKrsError, setExistingKrsError] = useState<string>("");

  const ventureOptions = useMemo(() => {
    if (!config) {
      return [] as AppConfig["ventures"];
    }

    return config.ventures;
  }, [config]);

  const selectedObjectiveVenture = useMemo(() => {
    if (!config) {
      return undefined;
    }

    return config.ventures.find((venture) => {
      return venture.name.toLowerCase() === objectiveVenture.trim().toLowerCase();
    });
  }, [config, objectiveVenture]);

  const objectiveDepartmentOptions = useMemo(() => {
    if (!config) {
      return [] as string[];
    }

    if (selectedObjectiveVenture) {
      return selectedObjectiveVenture.departments.map((department) => department.name);
    }

    return Array.from(
      new Set(
        config.ventures.flatMap((venture) => {
          return venture.departments.map((department) => department.name);
        })
      )
    );
  }, [config, selectedObjectiveVenture]);

  const objectiveMap = useMemo(() => {
    return new Map(objectives.map((objective) => [objective.objectiveKey, objective]));
  }, [objectives]);

  const selectedKrObjective = useMemo(() => {
    return objectiveMap.get(krObjectiveKey);
  }, [objectiveMap, krObjectiveKey]);

  const loadExistingKrs = async (objectiveKey: string): Promise<void> => {
    if (!objectiveKey) {
      setExistingKrs([]);
      setExistingKrsError("");
      return;
    }

    setExistingKrsLoading(true);
    setExistingKrsError("");

    const response = await fetch(apiPath(`/api/krs?objectiveKey=${encodeURIComponent(objectiveKey)}`), { cache: "no-store" });
    const payload = await readJson<KeyResult[] & ApiError>(response);

    if (!response.ok || !payload || !Array.isArray(payload)) {
      setExistingKrs([]);
      setExistingKrsError(payload?.error ?? "Failed to load key results.");
      setExistingKrsLoading(false);
      return;
    }

    setExistingKrs(payload);
    setExistingKrsLoading(false);
  };

  const loadObjectiveCodePreview = async (): Promise<void> => {
    if (!objectiveDepartment.trim()) {
      setObjectiveCodePreview("");
      return;
    }

    const params = new URLSearchParams({
      department: objectiveDepartment.trim(),
      ventureName: objectiveVenture.trim(),
      strategicTheme: objectiveStrategicTheme.trim()
    });

    const response = await fetch(apiPath(`/api/codes/objective?${params.toString()}`), { cache: "no-store" });
    if (!response.ok) {
      setObjectiveCodePreview("OBJ-001");
      return;
    }

    const payload = (await response.json()) as { code?: string };
    setObjectiveCodePreview(payload.code?.trim() || "OBJ-001");
  };

  const loadKrCodePreview = async (): Promise<void> => {
    if (!krObjectiveKey.trim()) {
      setKrCodePreview("");
      return;
    }

    const response = await fetch(apiPath(`/api/codes/kr?objectiveKey=${encodeURIComponent(krObjectiveKey)}`), { cache: "no-store" });
    if (!response.ok) {
      setKrCodePreview("KR-001");
      return;
    }

    const payload = (await response.json()) as { code?: string };
    setKrCodePreview(payload.code?.trim() || "KR-001");
  };

  const loadData = async (): Promise<void> => {
    const [periodResp, objectiveResp, configResp] = await Promise.all([
      fetch(apiPath("/api/periods"), { cache: "no-store" }),
      fetch(apiPath("/api/objectives"), { cache: "no-store" }),
      fetch(apiPath("/api/config"), { cache: "no-store" })
    ]);

    const [periodPayload, objectivePayload, configPayload] = await Promise.all([
      readJson<Period[] & ApiError>(periodResp),
      readJson<Objective[] & ApiError>(objectiveResp),
      readJson<AppConfig & ApiError>(configResp)
    ]);

    if (periodResp.ok && periodPayload && Array.isArray(periodPayload)) {
      setPeriods(periodPayload);
    }

    if (objectiveResp.ok && objectivePayload && Array.isArray(objectivePayload)) {
      setObjectives(objectivePayload);
      if (!krObjectiveKey && objectivePayload.length > 0) {
        setKrObjectiveKey(objectivePayload[0].objectiveKey);
      }
    }

    if (configResp.ok && configPayload && "ventures" in configPayload) {
      setConfig(configPayload);
      const firstVenture = configPayload.ventures[0];
      if (!objectiveVenture && firstVenture) {
        setObjectiveVenture(firstVenture.name);
      }

      if (!objectiveDepartment && firstVenture?.departments[0]) {
        setObjectiveDepartment(firstVenture.departments[0].name);
      }
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadExistingKrs(krObjectiveKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [krObjectiveKey]);

  useEffect(() => {
    if (!selectedObjectiveVenture || selectedObjectiveVenture.departments.length === 0) {
      return;
    }

    const hasSelectedDepartment = selectedObjectiveVenture.departments.some((department) => {
      return department.name.toLowerCase() === objectiveDepartment.trim().toLowerCase();
    });

    if (!hasSelectedDepartment) {
      setObjectiveDepartment(selectedObjectiveVenture.departments[0].name);
    }
  }, [objectiveDepartment, selectedObjectiveVenture]);

  useEffect(() => {
    if (mode !== "objective") {
      return;
    }

    void loadObjectiveCodePreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, objectiveDepartment, objectiveVenture, objectiveStrategicTheme]);

  useEffect(() => {
    if (mode !== "kr") {
      return;
    }

    void loadKrCodePreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, krObjectiveKey]);

  const createObjective = async (): Promise<void> => {
    const objectiveTitles = objectiveTitle
      .split("\n")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    if (objectiveTitles.length === 0) {
      setError("Objective title is required (you can add one per line).");
      return;
    }

    if (!objectiveVenture.trim()) {
      setError("Venture is required.");
      return;
    }

    if (!objectiveStrategicTheme.trim()) {
      setError("Strategic Theme is required.");
      return;
    }

    if (!objectiveDepartment.trim()) {
      setError("Department is required.");
      return;
    }

    const period = pickDefaultPeriod(periods);
    if (!period) {
      setError("No period is configured.");
      return;
    }

    const selectedVenture = selectedObjectiveVenture;
    if (!selectedVenture) {
      setError("Selected venture is not configured.");
      return;
    }

    const departmentInVenture = selectedVenture.departments.some((department) => {
      return department.name.toLowerCase() === objectiveDepartment.trim().toLowerCase();
    });

    if (!departmentInVenture) {
      setError("Selected department does not belong to the selected venture.");
      return;
    }

    const parsedObjectiveProgress = parseProgressValue(objectiveProgress);
    const objectivePctValue = Number(objectiveProgressPct);
    const hasObjectivePct = Number.isFinite(objectivePctValue);

    if (!parsedObjectiveProgress && !hasObjectivePct) {
      setError("Provide Objective Progress (for example: 45 / 100) or Progress %.");
      return;
    }

    let resolvedObjectiveProgressPct = 0;
    if (hasObjectivePct) {
      resolvedObjectiveProgressPct = objectivePctValue;
    } else if (parsedObjectiveProgress) {
      resolvedObjectiveProgressPct = (parsedObjectiveProgress.current / parsedObjectiveProgress.target) * 100;
    }

  const { startDate, endDate } = getCycleDateRange(objectiveCycle);

    setIsBusy(true);
    setError("");
    setMessage("");

    for (let index = 0; index < objectiveTitles.length; index += 1) {
      const response = await fetch(apiPath("/api/objectives"), {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          objectiveCode: objectiveTitles.length === 1 ? objectiveCodePreview || undefined : undefined,
          periodKey: period.periodKey,
          title: objectiveTitles[index],
          description: objectiveNotes.trim(),
          owner: objectiveOwner.trim(),
          ownerEmail: objectiveOwnerEmail.trim(),
          department: objectiveDepartment.trim(),
          ventureName: objectiveVenture.trim(),
          strategicTheme: objectiveStrategicTheme.trim(),
          objectiveType,
          okrCycle: objectiveCycle,
          progressPct: clampProgressPct(resolvedObjectiveProgressPct),
          blockers: objectiveBlockers.trim(),
          keyRisksDependency: objectiveKeyRisksDependency.trim(),
          notes: objectiveNotes.trim(),
          status: objectiveStatus,
          confidence: "Medium",
          rag: "Amber",
          startDate,
          endDate
        })
      });

      const payload = await readJson<ApiError>(response);
      if (!response.ok) {
        setError(payload?.error ?? `Failed to create objective at line ${index + 1}.`);
        setIsBusy(false);
        return;
      }
    }

    setObjectiveCodePreview("");
    setObjectiveTitle("");
    setObjectiveStrategicTheme("");
    setObjectiveProgress("0 / 100");
    setObjectiveProgressPct("0");
    setObjectiveBlockers("");
    setObjectiveKeyRisksDependency("");
    setObjectiveNotes("");
    setMessage("Objective created.");
    await loadData();
    router.refresh();
    setIsBusy(false);
  };

  const createKr = async (): Promise<void> => {
    const selectedObjective = objectiveMap.get(krObjectiveKey);
    if (!selectedObjective) {
      setError("Select an objective.");
      return;
    }

    const krTitles = krTitle
      .split("\n")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    if (krTitles.length === 0) {
      setError("KR title is required (you can add one per line).");
      return;
    }

    const parsedProgress = parseProgressValue(krProgress);
    const progressPct = Number(krProgressPct);
    const hasProgressPct = Number.isFinite(progressPct);

    if (!parsedProgress && !hasProgressPct) {
      setError("Provide Progress (for example: 45 / 100) or Progress %.");
      return;
    }

    const baselineValue = 0;
    let targetValue = 100;
    let currentValue = 0;

    if (parsedProgress) {
      targetValue = parsedProgress.target;
      currentValue = parsedProgress.current;
    } else if (hasProgressPct) {
      targetValue = 100;
      currentValue = progressPct;
    }

    setIsBusy(true);
    setError("");
    setMessage("");

    for (let index = 0; index < krTitles.length; index += 1) {
      const response = await fetch(apiPath("/api/krs"), {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          krCode: krTitles.length === 1 ? krCodePreview || undefined : undefined,
          objectiveKey: selectedObjective.objectiveKey,
          periodKey: selectedObjective.periodKey,
          title: krTitles[index],
          owner: krOwner.trim(),
          ownerEmail: krOwnerEmail.trim(),
          metricType: "Operational" as MetricType,
          baselineValue,
          targetValue,
          currentValue,
          status: krStatus,
          dueDate: selectedObjective.endDate,
          checkInFrequency: krCheckInFrequency,
          blockers: krBlockers.trim(),
          notes: krNotes.trim()
        })
      });

      const payload = await readJson<ApiError>(response);
      if (!response.ok) {
        setError(payload?.error ?? `Failed to create KR at line ${index + 1}.`);
        setIsBusy(false);
        return;
      }
    }

    setKrCodePreview("");
    setKrTitle("");
    setKrProgress("0 / 100");
    setKrProgressPct("0");
    setKrCheckInFrequency("Weekly");
    setKrBlockers("");
    setKrNotes("");
    setMessage("Key result created.");
    await loadData();
    await loadExistingKrs(selectedObjective.objectiveKey);
    router.refresh();
    setIsBusy(false);
  };

  return (
    <section className="section">
      <div className="section-header">
        <h2>Quick Create</h2>
      </div>

      <div className="tab-row" role="tablist" aria-label="Quick create tabs">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "objective"}
          className={`tab-btn ${mode === "objective" ? "tab-btn-active" : ""}`}
          onClick={() => setMode(mode === "objective" ? "none" : "objective")}
        >
          + Objective
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "kr"}
          className={`tab-btn ${mode === "kr" ? "tab-btn-active" : ""}`}
          onClick={() => setMode(mode === "kr" ? "none" : "kr")}
        >
          + KR
        </button>
      </div>

      {mode === "objective" ? (
        <div className="form-grid">
          <div className="config-grid">
            <div className="field">
              <label htmlFor="quick-objective-code">Objective Code</label>
              <input
                id="quick-objective-code"
                value={objectiveCodePreview}
                readOnly
              />
            </div>
            <div className="field">
              <label htmlFor="quick-objective-title">Objectives</label>
              <textarea
                id="quick-objective-title"
                value={objectiveTitle}
                onChange={(event) => setObjectiveTitle(event.target.value)}
                placeholder="One objective per line"
              />
            </div>
            <OwnerInput
              id="quick-objective-owner"
              label="Owner (optional)"
              value={objectiveOwner}
              onChange={setObjectiveOwner}
              onSelectUser={(user: OwnerSuggestion | null) => {
                setObjectiveOwnerEmail(user ? user.mail || user.principalName : "");
              }}
              placeholder="Owner (optional)"
            />
            <div className="field">
              <label htmlFor="quick-objective-owner-email">Owner Email</label>
              <input id="quick-objective-owner-email" value={objectiveOwnerEmail} readOnly />
            </div>
            <div className="field">
              <label htmlFor="quick-objective-venture">Venture</label>
              <select
                id="quick-objective-venture"
                value={objectiveVenture}
                onChange={(event) => {
                  const nextVenture = event.target.value;
                  setObjectiveVenture(nextVenture);

                  const venture = ventureOptions.find((item) => item.name === nextVenture);
                  if (venture?.departments[0]) {
                    setObjectiveDepartment(venture.departments[0].name);
                  }
                }}
              >
                <option value="">Select venture</option>
                {ventureOptions.map((venture) => (
                  <option key={venture.ventureKey} value={venture.name}>
                    {venture.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="quick-objective-theme">Strategic Theme</label>
              <input
                id="quick-objective-theme"
                value={objectiveStrategicTheme}
                onChange={(event) => setObjectiveStrategicTheme(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="quick-objective-department">Department</label>
              <select
                id="quick-objective-department"
                value={objectiveDepartment}
                onChange={(event) => setObjectiveDepartment(event.target.value)}
              >
                <option value="">Select department</option>
                {objectiveDepartmentOptions.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="quick-objective-type">Objective Type</label>
              <select
                id="quick-objective-type"
                value={objectiveType}
                onChange={(event) => setObjectiveType(event.target.value as ObjectiveType)}
              >
                {OBJECTIVE_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="quick-objective-status">Health</label>
              <select
                id="quick-objective-status"
                value={objectiveStatus}
                onChange={(event) => setObjectiveStatus(event.target.value as ObjectiveStatus)}
              >
                {HEALTH_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="quick-objective-cycle">OKR Cycle</label>
              <select
                id="quick-objective-cycle"
                value={objectiveCycle}
                onChange={(event) => setObjectiveCycle(event.target.value as OkrCycle)}
              >
                {OKR_CYCLE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="quick-objective-progress">Progress</label>
              <input
                id="quick-objective-progress"
                value={objectiveProgress}
                onChange={(event) => setObjectiveProgress(event.target.value)}
                placeholder="45 / 100"
              />
            </div>
            <div className="field">
              <label htmlFor="quick-objective-progress-pct">Progress %</label>
              <input
                id="quick-objective-progress-pct"
                type="number"
                step="any"
                value={objectiveProgressPct}
                onChange={(event) => setObjectiveProgressPct(event.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="quick-objective-blockers">Blockers</label>
            <textarea
              id="quick-objective-blockers"
              value={objectiveBlockers}
              onChange={(event) => setObjectiveBlockers(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="quick-objective-risk">Key Risks/Dependancy</label>
            <textarea
              id="quick-objective-risk"
              value={objectiveKeyRisksDependency}
              onChange={(event) => setObjectiveKeyRisksDependency(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="quick-objective-notes">Notes</label>
            <textarea id="quick-objective-notes" value={objectiveNotes} onChange={(event) => setObjectiveNotes(event.target.value)} />
          </div>
          <div className="actions">
            <button className="btn" type="button" disabled={isBusy} onClick={() => void createObjective()}>
              Create Objective
            </button>
          </div>
        </div>
      ) : null}

      {mode === "kr" ? (
        <div className="form-grid">
          <div className="config-grid">
            <div className="field">
              <label htmlFor="quick-kr-code">KR Code</label>
              <input id="quick-kr-code" value={krCodePreview} readOnly />
            </div>
            <div className="field">
              <label htmlFor="quick-kr-objective">Objectives</label>
              <select id="quick-kr-objective" value={krObjectiveKey} onChange={(event) => setKrObjectiveKey(event.target.value)}>
                <option value="">Select objective</option>
                {objectives.map((objective) => (
                <option key={objective.objectiveKey} value={objective.objectiveKey}>
                    {objective.title} ({objective.objectiveCode ?? objective.objectiveKey})
                </option>
              ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="quick-kr-title">KR</label>
              <textarea
                id="quick-kr-title"
                value={krTitle}
                onChange={(event) => setKrTitle(event.target.value)}
                placeholder="One key result per line"
              />
            </div>
            <OwnerInput
              id="quick-kr-owner"
              label="Owner (optional)"
              value={krOwner}
              onChange={setKrOwner}
              onSelectUser={(user: OwnerSuggestion | null) => {
                setKrOwnerEmail(user ? user.mail || user.principalName : "");
              }}
              placeholder="Owner (optional)"
            />
            <div className="field">
              <label htmlFor="quick-kr-owner-email">Owner Email</label>
              <input id="quick-kr-owner-email" value={krOwnerEmail} readOnly />
            </div>
            <div className="field">
              <label htmlFor="quick-kr-strategic-theme">Strategic Theme</label>
              <input id="quick-kr-strategic-theme" value={selectedKrObjective?.strategicTheme ?? ""} readOnly />
            </div>
            <div className="field">
              <label htmlFor="quick-kr-objective-type">Objective Type</label>
              <input id="quick-kr-objective-type" value={selectedKrObjective?.objectiveType ?? ""} readOnly />
            </div>
            <div className="field">
              <label htmlFor="quick-kr-status">Health</label>
              <select id="quick-kr-status" value={krStatus} onChange={(event) => setKrStatus(event.target.value as KrStatus)}>
                {KR_HEALTH_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="quick-kr-checkin-frequency">Check-in Frequency</label>
              <select
                id="quick-kr-checkin-frequency"
                value={krCheckInFrequency}
                onChange={(event) => setKrCheckInFrequency(event.target.value as CheckInFrequency)}
              >
                {CHECKIN_FREQUENCY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="quick-kr-progress">Progress</label>
              <input
                id="quick-kr-progress"
                value={krProgress}
                onChange={(event) => setKrProgress(event.target.value)}
                placeholder="45 / 100"
              />
            </div>
            <div className="field">
              <label htmlFor="quick-kr-progress-pct">Progress %</label>
              <input
                id="quick-kr-progress-pct"
                type="number"
                step="any"
                value={krProgressPct}
                onChange={(event) => setKrProgressPct(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="quick-kr-okr-cycle">OKR Cycle</label>
              <input id="quick-kr-okr-cycle" value={selectedKrObjective?.okrCycle ?? ""} readOnly />
            </div>
          </div>

          <div className="field">
            <label htmlFor="quick-kr-risks">Key Risks/Dependancy</label>
            <textarea id="quick-kr-risks" value={selectedKrObjective?.keyRisksDependency ?? ""} readOnly />
          </div>

          <div className="field">
            <label htmlFor="quick-kr-blockers">Blockers</label>
            <textarea id="quick-kr-blockers" value={krBlockers} onChange={(event) => setKrBlockers(event.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="quick-kr-notes">Notes</label>
            <textarea id="quick-kr-notes" value={krNotes} onChange={(event) => setKrNotes(event.target.value)} />
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Objective</th>
                  <th>KR</th>
                  <th>Owner</th>
                  <th>Strategic Theme</th>
                  <th>Objective Type</th>
                  <th>Objective Health</th>
                  <th>Objective Progress %</th>
                  <th>KR Health</th>
                  <th>KR Progress</th>
                  <th>KR Progress %</th>
                  <th>OKR Cycle</th>
                  <th>Blockers</th>
                  <th>Key Risks/Dependancy</th>
                  <th>Check-in Frequency</th>
                  <th>KR Notes</th>
                  <th>Last updated</th>
                </tr>
              </thead>
              <tbody>
                {existingKrsLoading ? (
                  <tr>
                    <td colSpan={16}>Loading key results...</td>
                  </tr>
                ) : existingKrsError ? (
                  <tr>
                    <td colSpan={16}>{existingKrsError}</td>
                  </tr>
                ) : existingKrs.length === 0 ? (
                  <tr>
                    <td colSpan={16}>No key results for the selected objective.</td>
                  </tr>
                ) : (
                  existingKrs.map((kr) => {
                    const parentObjective = objectiveMap.get(kr.objectiveKey);

                    return (
                      <tr key={kr.krKey}>
                        <td>
                          {parentObjective?.title || "-"}
                          <div className="meta">{parentObjective?.objectiveCode || parentObjective?.objectiveKey || "-"}</div>
                        </td>
                        <td>
                          {kr.title}
                          <div className="meta">{kr.krCode || kr.krKey}</div>
                        </td>
                        <td>{kr.owner || "-"}</td>
                        <td>{parentObjective?.strategicTheme || "-"}</td>
                        <td>{parentObjective?.objectiveType || "-"}</td>
                        <td>{parentObjective ? formatStatusLabel(parentObjective.status) : "-"}</td>
                        <td>{parentObjective ? `${parentObjective.progressPct}%` : "-"}</td>
                        <td>{formatStatusLabel(kr.status)}</td>
                        <td>
                          {formatMetricValue(kr.currentValue, kr.metricType)} / {formatMetricValue(kr.targetValue, kr.metricType)}
                        </td>
                        <td>{kr.progressPct}%</td>
                        <td>{parentObjective?.okrCycle || "-"}</td>
                        <td>{kr.blockers || "-"}</td>
                        <td>{parentObjective?.keyRisksDependency || "-"}</td>
                        <td>{kr.checkInFrequency}</td>
                        <td>{kr.notes || "-"}</td>
                        <td>{formatDate(kr.lastCheckinAt)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="actions">
            <button className="btn" type="button" disabled={isBusy} onClick={() => void createKr()}>
              Create Key Result
            </button>
          </div>
        </div>
      ) : null}

      {message ? <p className="message">{message}</p> : null}
      {error ? <p className="message danger">{error}</p> : null}
    </section>
  );
}
