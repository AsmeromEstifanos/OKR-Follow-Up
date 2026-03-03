"use client";

import type { ObjectiveStatus, ObjectiveType, OkrCycle } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  positionName: string;
  strategicTheme: string;
  defaultPeriodKey?: string;
  defaultStartDate?: string;
  defaultEndDate?: string;
  defaultCycle: "Q1" | "Q2" | "Q3" | "Q4";
  defaultOwner: string;
};

type ApiError = {
  error?: string;
};

const OBJECTIVE_TYPE_OPTIONS: ObjectiveType[] = ["Aspirational", "Committed", "Learning"];
const OBJECTIVE_STATUS_OPTIONS: ObjectiveStatus[] = ["NotStarted", "OnTrack", "AtRisk", "OffTrack", "Done"];
const CYCLE_OPTIONS: OkrCycle[] = ["Q1", "Q2", "Q3", "Q4"];

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

function todayPlus(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function DashboardObjectiveControls({
  positionName,
  strategicTheme,
  defaultPeriodKey,
  defaultStartDate,
  defaultEndDate,
  defaultCycle,
  defaultOwner
}: Props): JSX.Element {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [title, setTitle] = useState<string>("");
  const [objectiveCode, setObjectiveCode] = useState<string>("");
  const [objectiveType, setObjectiveType] = useState<ObjectiveType>("Committed");
  const [status, setStatus] = useState<ObjectiveStatus>("NotStarted");
  const [progress, setProgress] = useState<string>("0");
  const [progressPct, setProgressPct] = useState<string>("0");
  const [okrCycle, setOkrCycle] = useState<OkrCycle>(defaultCycle);
  const [keyRisksDependency, setKeyRisksDependency] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [error, setError] = useState<string>("");

  const openAdd = (): void => {
    setError("");
    setTitle("");
    setObjectiveCode("");
    setObjectiveType("Committed");
    setStatus("NotStarted");
    setProgress("0");
    setProgressPct("0");
    setOkrCycle(defaultCycle);
    setKeyRisksDependency("");
    setNotes("");
    setLastUpdated("");
    setIsAdding(true);
  };

  const closeAdd = (): void => {
    if (isSaving) {
      return;
    }

    setError("");
    setTitle("");
    setObjectiveCode("");
    setObjectiveType("Committed");
    setStatus("NotStarted");
    setProgress("0");
    setProgressPct("0");
    setOkrCycle(defaultCycle);
    setKeyRisksDependency("");
    setNotes("");
    setLastUpdated("");
    setIsAdding(false);
  };

  const createObjective = async (): Promise<void> => {
    if (isSaving) {
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedObjectiveCode = objectiveCode.trim();
    if (!trimmedTitle) {
      setError("Objective title is required.");
      return;
    }

    if (!defaultPeriodKey) {
      setError("No period is configured.");
      return;
    }

    const startDate = defaultStartDate ?? todayPlus(0);
    const endDate = defaultEndDate ?? todayPlus(90);
    const rawProgress = Number(progress);
    const rawProgressPct = Number(progressPct);
    const hasProgress = Number.isFinite(rawProgress);
    const hasProgressPct = Number.isFinite(rawProgressPct);

    if (!hasProgress && !hasProgressPct) {
      setError("Provide Progress or Progress %.");
      return;
    }

    const resolvedProgressPct = hasProgressPct ? rawProgressPct : rawProgress;
    const normalizedProgressPct = Math.min(100, Math.max(0, resolvedProgressPct));
    const lastCheckinAt = lastUpdated ? new Date(`${lastUpdated}T00:00:00`).toISOString() : null;

    setIsSaving(true);
    setError("");

    const response = await fetch("/api/objectives", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        objectiveKey: trimmedObjectiveCode || undefined,
        periodKey: defaultPeriodKey,
        title: trimmedTitle,
        description: notes.trim(),
        owner: defaultOwner,
        department: positionName,
        strategicTheme,
        objectiveType,
        okrCycle,
        keyRisksDependency: keyRisksDependency.trim(),
        notes: notes.trim(),
        status,
        progressPct: normalizedProgressPct,
        confidence: "Medium",
        rag: "Amber",
        startDate,
        endDate,
        lastCheckinAt
      })
    });
    const payload = await readJson<ApiError>(response);

    if (!response.ok) {
      setError(payload?.error ?? "Failed to add objective.");
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    closeAdd();
    router.refresh();
  };

  return (
    <div className="objective-controls">
      <button
        className={`tab-btn objective-add-btn ${isAdding ? "tab-btn-active" : ""}`}
        type="button"
        onClick={isAdding ? closeAdd : openAdd}
        disabled={isSaving}
      >
        Add Objective
      </button>
      {isAdding ? (
        <form
          className="objective-form"
          onSubmit={(event) => {
            event.preventDefault();
            void createObjective();
          }}
        >
          <div className="objective-form-grid">
            <div className="field">
              <label>Objective Code</label>
              <input
                value={objectiveCode}
                onChange={(event) => setObjectiveCode(event.target.value)}
                placeholder="OKR-001"
                aria-label={`Objective code for ${positionName}`}
                disabled={isSaving}
              />
            </div>
            <div className="field">
              <label>Objective</label>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Objective title"
                aria-label={`Objective title for ${positionName}`}
                autoFocus
                disabled={isSaving}
              />
            </div>
            <div className="field">
              <label>Objective Type</label>
              <select
                value={objectiveType}
                onChange={(event) => setObjectiveType(event.target.value as ObjectiveType)}
                disabled={isSaving}
              >
                {OBJECTIVE_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Health</label>
              <select value={status} onChange={(event) => setStatus(event.target.value as ObjectiveStatus)} disabled={isSaving}>
                {OBJECTIVE_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Progress</label>
              <input
                type="number"
                step="any"
                value={progress}
                onChange={(event) => setProgress(event.target.value)}
                placeholder="0"
                disabled={isSaving}
              />
            </div>
            <div className="field">
              <label>Progress %</label>
              <input
                type="number"
                step="any"
                value={progressPct}
                onChange={(event) => setProgressPct(event.target.value)}
                placeholder="0"
                disabled={isSaving}
              />
            </div>
            <div className="field">
              <label>OKR Cycle</label>
              <select value={okrCycle} onChange={(event) => setOkrCycle(event.target.value as OkrCycle)} disabled={isSaving}>
                {CYCLE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Last updated</label>
              <input type="date" value={lastUpdated} onChange={(event) => setLastUpdated(event.target.value)} disabled={isSaving} />
            </div>
            <div className="field objective-field-wide">
              <label>Key Risks/Dependancy</label>
              <input
                value={keyRisksDependency}
                onChange={(event) => setKeyRisksDependency(event.target.value)}
                placeholder="Key risks/dependencies"
                disabled={isSaving}
              />
            </div>
            <div className="field objective-field-wide">
              <label>Notes</label>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} disabled={isSaving} />
            </div>
          </div>
          <div className="actions">
            <button className="btn" type="submit" disabled={isSaving}>
              Add
            </button>
            <button className="tab-btn" type="button" onClick={closeAdd} disabled={isSaving}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      {error ? <p className="message danger">{error}</p> : null}
    </div>
  );
}
