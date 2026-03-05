"use client";

import OwnerInput from "@/app/owner-input";
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

type OwnerSuggestion = {
  displayName: string;
  principalName: string;
  mail: string;
};

const OBJECTIVE_TYPE_OPTIONS: ObjectiveType[] = ["Aspirational", "Committed", "Learning"];
const OBJECTIVE_STATUS_OPTIONS: ObjectiveStatus[] = ["NotStarted", "OnTrack", "AtRisk", "OffTrack", "Done"];
const CYCLE_OPTIONS: OkrCycle[] = ["Q1", "Q2", "Q3", "Q4"];

function ragPillClass(rag: string): string {
  if (rag === "Green") {
    return "pill pill-green";
  }

  if (rag === "Amber") {
    return "pill pill-amber";
  }

  return "pill pill-red";
}

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
  const objectiveCode = objective.objectiveCode ?? objective.objectiveKey;
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const [code, setCode] = useState<string>(objectiveCode);
  const [title, setTitle] = useState<string>(objective.title);
  const [owner, setOwner] = useState<string>(objective.owner);
  const [ownerEmail, setOwnerEmail] = useState<string>(
    objective.ownerEmail ?? (objective.owner.includes("@") ? objective.owner : "")
  );
  const [objectiveType, setObjectiveType] = useState<ObjectiveType>(objective.objectiveType);
  const [status, setStatus] = useState<ObjectiveStatus>(objective.status);
  const [progressPct, setProgressPct] = useState<string>(String(objective.progressPct));
  const [okrCycle, setOkrCycle] = useState<OkrCycle>(objective.okrCycle);
  const [blockers, setBlockers] = useState<string>(objective.blockers ?? "");
  const [keyRisksDependency, setKeyRisksDependency] = useState<string>(objective.keyRisksDependency ?? "");
  const [notes, setNotes] = useState<string>(objective.notes ?? objective.description ?? "");

  useEffect(() => {
    setCode(objectiveCode);
    setTitle(objective.title);
    setOwner(objective.owner);
    setOwnerEmail(objective.ownerEmail ?? (objective.owner.includes("@") ? objective.owner : ""));
    setObjectiveType(objective.objectiveType);
    setStatus(objective.status);
    setProgressPct(String(objective.progressPct));
    setOkrCycle(objective.okrCycle);
    setBlockers(objective.blockers ?? "");
    setKeyRisksDependency(objective.keyRisksDependency ?? "");
    setNotes(objective.notes ?? objective.description ?? "");
  }, [objective, objectiveCode]);

  const resetDraft = (): void => {
    setCode(objectiveCode);
    setTitle(objective.title);
    setOwner(objective.owner);
    setOwnerEmail(objective.ownerEmail ?? (objective.owner.includes("@") ? objective.owner : ""));
    setObjectiveType(objective.objectiveType);
    setStatus(objective.status);
    setProgressPct(String(objective.progressPct));
    setOkrCycle(objective.okrCycle);
    setBlockers(objective.blockers ?? "");
    setKeyRisksDependency(objective.keyRisksDependency ?? "");
    setNotes(objective.notes ?? objective.description ?? "");
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

    if (!owner.trim()) {
      setError("Objective owner is required.");
      return;
    }

    const numericProgressPct = Number(progressPct);
    if (!Number.isFinite(numericProgressPct)) {
      setError("Provide Progress %.");
      return;
    }

    const resolvedProgressPct = numericProgressPct;

    setIsSaving(true);
    setError("");

    const response = await fetch(`/api/objectives/${encodeURIComponent(objective.objectiveKey)}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        objectiveCode: code.trim(),
        title: title.trim(),
        owner: owner.trim(),
        ownerEmail: ownerEmail.trim(),
        objectiveType,
        status,
        progressPct: clampPercent(resolvedProgressPct),
        okrCycle,
        blockers: blockers.trim(),
        keyRisksDependency: keyRisksDependency.trim(),
        notes: notes.trim()
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
        <div className="board-meta">{objectiveCode}</div>
        {isEditing ? (
          <input
            className="objective-row-input"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="OBJ-001"
            disabled={isSaving}
          />
        ) : null}
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
          <OwnerInput
            id={`objective-owner-inline-${objective.objectiveKey}`}
            value={owner}
            onChange={setOwner}
            onSelectUser={(user: OwnerSuggestion | null) => {
              setOwnerEmail(user ? user.mail || user.principalName : "");
            }}
            disabled={isSaving}
            showLabel={false}
            inputClassName="objective-row-input"
          />
        ) : (
          objective.owner || "-"
        )}
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
        <span className={ragPillClass(objective.rag)}>{objective.rag}</span>
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
            value={blockers}
            onChange={(event) => setBlockers(event.target.value)}
            placeholder="Blockers"
            disabled={isSaving}
          />
        ) : (
          objective.blockers || "-"
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
        {formatDate(objective.lastCheckinAt)}
      </td>
    </tr>
  );
}
