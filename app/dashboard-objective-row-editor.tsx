"use client";

import type { Objective, ObjectiveStatus, ObjectiveType, OkrCycle } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  objective: Objective;
  keyResultsCount: number;
};

type ApiError = {
  error?: string;
};

const OBJECTIVE_TYPE_OPTIONS: ObjectiveType[] = ["Aspirational", "Committed", "Learning"];
const OBJECTIVE_STATUS_OPTIONS: ObjectiveStatus[] = ["NotStarted", "OnTrack", "AtRisk", "OffTrack", "Done"];
const CYCLE_OPTIONS: OkrCycle[] = ["Q1", "Q2", "Q3", "Q4"];

function formatStatus(value: ObjectiveStatus): string {
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

function toDateInput(value: string | null): string {
  if (!value) {
    return "";
  }

  return value.slice(0, 10);
}

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString();
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
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

export default function DashboardObjectiveRowEditor({ objective, keyResultsCount }: Props): JSX.Element {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const [title, setTitle] = useState<string>(objective.title);
  const [objectiveType, setObjectiveType] = useState<ObjectiveType>(objective.objectiveType);
  const [status, setStatus] = useState<ObjectiveStatus>(objective.status);
  const [progress, setProgress] = useState<string>(String(Math.round(objective.progressPct)));
  const [progressPct, setProgressPct] = useState<string>(String(objective.progressPct));
  const [okrCycle, setOkrCycle] = useState<OkrCycle>(objective.okrCycle);
  const [keyRisksDependency, setKeyRisksDependency] = useState<string>(objective.keyRisksDependency ?? "");
  const [notes, setNotes] = useState<string>(objective.notes ?? objective.description ?? "");
  const [lastUpdated, setLastUpdated] = useState<string>(toDateInput(objective.lastCheckinAt));

  useEffect(() => {
    setTitle(objective.title);
    setObjectiveType(objective.objectiveType);
    setStatus(objective.status);
    setProgress(String(Math.round(objective.progressPct)));
    setProgressPct(String(objective.progressPct));
    setOkrCycle(objective.okrCycle);
    setKeyRisksDependency(objective.keyRisksDependency ?? "");
    setNotes(objective.notes ?? objective.description ?? "");
    setLastUpdated(toDateInput(objective.lastCheckinAt));
  }, [objective]);

  const resetDraft = (): void => {
    setTitle(objective.title);
    setObjectiveType(objective.objectiveType);
    setStatus(objective.status);
    setProgress(String(Math.round(objective.progressPct)));
    setProgressPct(String(objective.progressPct));
    setOkrCycle(objective.okrCycle);
    setKeyRisksDependency(objective.keyRisksDependency ?? "");
    setNotes(objective.notes ?? objective.description ?? "");
    setLastUpdated(toDateInput(objective.lastCheckinAt));
  };

  const cancelEdit = (): void => {
    setError("");
    setIsEditing(false);
    resetDraft();
  };

  const saveEdit = async (): Promise<void> => {
    if (isSaving) {
      return;
    }

    if (!title.trim()) {
      setError("Objective title is required.");
      return;
    }

    const numericProgress = Number(progress);
    const numericProgressPct = Number(progressPct);
    const hasProgress = Number.isFinite(numericProgress);
    const hasProgressPct = Number.isFinite(numericProgressPct);

    if (!hasProgress && !hasProgressPct) {
      setError("Provide Progress or Progress %.");
      return;
    }

    const resolvedProgressPct = hasProgressPct ? numericProgressPct : numericProgress;

    setIsSaving(true);
    setError("");

    const response = await fetch(`/api/objectives/${encodeURIComponent(objective.objectiveKey)}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        title: title.trim(),
        objectiveType,
        status,
        progressPct: clampPercent(resolvedProgressPct),
        okrCycle,
        keyRisksDependency: keyRisksDependency.trim(),
        notes: notes.trim(),
        lastCheckinAt: lastUpdated ? new Date(`${lastUpdated}T00:00:00.000Z`).toISOString() : null
      })
    });

    if (!response.ok) {
      const payload = await readJson<ApiError>(response);
      setError(payload?.error ?? "Failed to update objective.");
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    setIsEditing(false);
    router.refresh();
  };

  const deleteCurrentObjective = async (): Promise<void> => {
    if (isSaving) {
      return;
    }

    const warning =
      keyResultsCount > 0
        ? `Delete objective '${objective.title}'? This will also delete ${keyResultsCount} key result(s) and related check-ins.`
        : `Delete objective '${objective.title}'? This action cannot be undone.`;

    if (!window.confirm(warning)) {
      return;
    }

    setIsSaving(true);
    setError("");

    const response = await fetch(`/api/objectives/${encodeURIComponent(objective.objectiveKey)}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      const payload = await readJson<ApiError>(response);
      setError(payload?.error ?? "Failed to delete objective.");
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    setIsEditing(false);
    router.refresh();
  };

  return (
    <tr className={`board-objective-row ${isEditing ? "board-objective-row-editing" : ""}`}>
      <td className="board-objective-cell">
        <div className="objective-title-wrap">
          {isEditing ? (
            <input
              className="objective-row-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Objective"
              autoFocus
              disabled={isSaving}
            />
          ) : (
            <span className="objective-title-text">{objective.title}</span>
          )}
          {!isEditing ? (
            <button
              type="button"
              className="objective-edit-trigger"
              aria-label={`Edit ${objective.title}`}
              title="Edit objective"
              onClick={() => setIsEditing(true)}
              disabled={isSaving}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path
                  d="M3 17.25V21h3.75L18.81 8.94l-3.75-3.75L3 17.25zm17.71-10.04a1 1 0 0 0 0-1.41l-2.5-2.5a1 1 0 0 0-1.41 0l-1.96 1.96 3.75 3.75 2.12-2.1z"
                  fill="currentColor"
                />
              </svg>
            </button>
          ) : null}
        </div>
        <div className="board-meta">{objective.objectiveKey}</div>
        {isEditing ? (
          <div className="objective-row-actions">
            <button className="btn" type="button" onClick={() => void saveEdit()} disabled={isSaving}>
              Save
            </button>
            <button className="btn btn-danger" type="button" onClick={() => void deleteCurrentObjective()} disabled={isSaving}>
              Delete
            </button>
            <button className="tab-btn" type="button" onClick={cancelEdit} disabled={isSaving}>
              Cancel
            </button>
          </div>
        ) : null}
        {error ? <p className="message danger objective-row-error">{error}</p> : null}
      </td>
      <td>
        {isEditing ? (
          <select
            className="objective-row-select"
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
        ) : (
          objective.objectiveType
        )}
      </td>
      <td>
        {isEditing ? (
          <select
            className="objective-row-select"
            value={status}
            onChange={(event) => setStatus(event.target.value as ObjectiveStatus)}
            disabled={isSaving}
          >
            {OBJECTIVE_STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          formatStatus(objective.status)
        )}
      </td>
      <td>
        {isEditing ? (
          <input
            className="objective-row-input"
            type="number"
            step="any"
            value={progress}
            onChange={(event) => setProgress(event.target.value)}
            placeholder="Progress"
            disabled={isSaving}
          />
        ) : (
          Math.round(objective.progressPct)
        )}
      </td>
      <td>
        {isEditing ? (
          <input
            className="objective-row-input"
            type="number"
            step="any"
            value={progressPct}
            onChange={(event) => setProgressPct(event.target.value)}
            placeholder="Progress %"
            disabled={isSaving}
          />
        ) : (
          `${objective.progressPct}%`
        )}
      </td>
      <td>
        {isEditing ? (
          <select
            className="objective-row-select"
            value={okrCycle}
            onChange={(event) => setOkrCycle(event.target.value as OkrCycle)}
            disabled={isSaving}
          >
            {CYCLE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          objective.okrCycle
        )}
      </td>
      <td>
        {isEditing ? (
          <input
            className="objective-row-input"
            value={keyRisksDependency}
            onChange={(event) => setKeyRisksDependency(event.target.value)}
            placeholder="Key Risks/Dependancy"
            disabled={isSaving}
          />
        ) : (
          objective.keyRisksDependency || "-"
        )}
      </td>
      <td>
        {isEditing ? (
          <input
            className="objective-row-input"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Notes"
            disabled={isSaving}
          />
        ) : (
          objective.notes || objective.description || "-"
        )}
      </td>
      <td>
        {isEditing ? (
          <input
            className="objective-row-input"
            type="date"
            value={lastUpdated}
            onChange={(event) => setLastUpdated(event.target.value)}
            disabled={isSaving}
          />
        ) : (
          formatDate(objective.lastCheckinAt)
        )}
      </td>
    </tr>
  );
}
