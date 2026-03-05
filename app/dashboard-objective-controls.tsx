"use client";

import OwnerInput from "@/app/owner-input";
import type { ObjectiveStatus, ObjectiveType, OkrCycle } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

type OwnerSuggestion = {
  displayName: string;
  principalName: string;
  mail: string;
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
  const [owner, setOwner] = useState<string>(defaultOwner);
  const [ownerEmail, setOwnerEmail] = useState<string>("");
  const [objectiveCodePreview, setObjectiveCodePreview] = useState<string>("");
  const [objectiveType, setObjectiveType] = useState<ObjectiveType>("Committed");
  const [status, setStatus] = useState<ObjectiveStatus>("NotStarted");
  const [progress, setProgress] = useState<string>("0");
  const [progressPct, setProgressPct] = useState<string>("0");
  const [okrCycle, setOkrCycle] = useState<OkrCycle>(defaultCycle);
  const [blockers, setBlockers] = useState<string>("");
  const [keyRisksDependency, setKeyRisksDependency] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [error, setError] = useState<string>("");

  const loadObjectiveCodePreview = async (): Promise<void> => {
    const params = new URLSearchParams({
      department: positionName,
      ventureName: strategicTheme,
      strategicTheme
    });

    const response = await fetch(`/api/codes/objective?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) {
      setObjectiveCodePreview("OBJ-001");
      return;
    }

    const payload = (await response.json()) as { code?: string };
    setObjectiveCodePreview(payload.code?.trim() || "OBJ-001");
  };

  const openAdd = (): void => {
    setError("");
    setTitle("");
    setOwner(defaultOwner);
    setOwnerEmail("");
    void loadObjectiveCodePreview();
    setObjectiveType("Committed");
    setStatus("NotStarted");
    setProgress("0");
    setProgressPct("0");
    setOkrCycle(defaultCycle);
    setBlockers("");
    setKeyRisksDependency("");
    setNotes("");
    setIsAdding(true);
  };

  const closeAdd = (): void => {
    if (isSaving) {
      return;
    }

    setError("");
    setTitle("");
    setOwner(defaultOwner);
    setOwnerEmail("");
    setObjectiveCodePreview("");
    setObjectiveType("Committed");
    setStatus("NotStarted");
    setProgress("0");
    setProgressPct("0");
    setOkrCycle(defaultCycle);
    setBlockers("");
    setKeyRisksDependency("");
    setNotes("");
    setIsAdding(false);
  };

  useEffect(() => {
    if (!isAdding) {
      return;
    }

    void loadObjectiveCodePreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdding, positionName, strategicTheme]);

  const createObjective = async (): Promise<void> => {
    if (isSaving) {
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Objective title is required.");
      return;
    }

    if (!defaultPeriodKey) {
      setError("No period is configured.");
      return;
    }

    if (!owner.trim()) {
      setError("Owner is required.");
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
    setIsSaving(true);
    setError("");

    const response = await fetch("/api/objectives", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        objectiveCode: objectiveCodePreview || undefined,
        periodKey: defaultPeriodKey,
        title: trimmedTitle,
        description: notes.trim(),
        owner: owner.trim(),
        ownerEmail: ownerEmail.trim(),
        department: positionName,
        ventureName: strategicTheme,
        strategicTheme,
        objectiveType,
        okrCycle,
        blockers: blockers.trim(),
        keyRisksDependency: keyRisksDependency.trim(),
        notes: notes.trim(),
        status,
        progressPct: normalizedProgressPct,
        confidence: "Medium",
        rag: "Amber",
        startDate,
        endDate
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
        className={`tab-btn tab-btn-add objective-add-btn ${isAdding ? "tab-btn-active" : ""}`}
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
                value={objectiveCodePreview}
                readOnly
                aria-label={`Objective code for ${positionName}`}
                disabled={isSaving}
              />
            </div>
            <OwnerInput
              id={`objective-owner-${positionName.replace(/\s+/g, "-").toLowerCase()}`}
              value={owner}
              onChange={setOwner}
              onSelectUser={(user: OwnerSuggestion | null) => {
                setOwnerEmail(user ? user.mail || user.principalName : "");
              }}
              disabled={isSaving}
            />
            <div className="field">
              <label>Owner Email</label>
              <input value={ownerEmail} readOnly disabled={isSaving} />
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
            <div className="field objective-field-wide">
              <label>Blockers</label>
              <textarea
                value={blockers}
                onChange={(event) => setBlockers(event.target.value)}
                placeholder="Current blockers"
                disabled={isSaving}
              />
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
            <button className="btn btn-add" type="submit" disabled={isSaving}>
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
