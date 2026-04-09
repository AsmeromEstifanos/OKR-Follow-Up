"use client";

import DashboardKeyResultControls from "@/app/dashboard-key-result-controls";
import DashboardKeyResultRowEditor from "@/app/dashboard-key-result-row-editor";
import OwnerInput from "@/app/owner-input";
import useCurrentUserEmail from "@/app/use-current-user-email";
import { apiPath } from "@/lib/base-path";
import { resolveOwnerEmail, resolveOwnerName } from "@/lib/owner";
import type {
  CheckInFrequency,
  KeyResult,
  KrStatus,
  MetricType,
  Objective,
  ObjectiveStatus,
  ObjectiveType,
  OkrCycle,
} from "@/lib/types";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";

type KeyResultRowData = {
  keyResult: KeyResult;
  latestUpdateNotes?: string;
  latestUpdatedAt?: string | null;
};

type Props = {
  objective: Objective;
  keyResults: KeyResultRowData[];
  positionOwnerEmail?: string;
  adminEmails: string[];
  objectiveTypeOptions: ObjectiveType[];
  objectiveStatusOptions: ObjectiveStatus[];
  objectiveCycleOptions: OkrCycle[];
  metricTypeOptions: MetricType[];
  keyResultStatusOptions: KrStatus[];
  checkInFrequencyOptions: CheckInFrequency[];
};

type ApiError = {
  error?: string;
};

type OwnerSuggestion = {
  displayName: string;
  principalName: string;
  mail: string;
};

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

function normalizeEmail(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export default function DashboardObjectiveRowEditor({
  objective,
  keyResults,
  positionOwnerEmail,
  adminEmails,
  objectiveTypeOptions,
  objectiveStatusOptions,
  objectiveCycleOptions,
  metricTypeOptions,
  keyResultStatusOptions,
  checkInFrequencyOptions
}: Props): JSX.Element {
  const router = useRouter();
  const signedInEmail = useCurrentUserEmail();
  const objectiveCode = objective.objectiveCode ?? objective.objectiveKey;
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const [code, setCode] = useState<string>(objectiveCode);
  const [title, setTitle] = useState<string>(objective.title);
  const [owner, setOwner] = useState<string>(resolveOwnerName(objective.owner));
  const [ownerEmail, setOwnerEmail] = useState<string>(resolveOwnerEmail(objective.owner, objective.ownerEmail));
  const [objectiveType, setObjectiveType] = useState<ObjectiveType>(objective.objectiveType);
  const [status, setStatus] = useState<ObjectiveStatus>(objective.status);
  const [progressPct, setProgressPct] = useState<string>(String(objective.progressPct));
  const [okrCycle, setOkrCycle] = useState<OkrCycle>(objective.okrCycle);
  const [blockers, setBlockers] = useState<string>(objective.blockers ?? "");
  const [keyRisksDependency, setKeyRisksDependency] = useState<string>(objective.keyRisksDependency ?? "");
  const [notes, setNotes] = useState<string>(objective.notes ?? objective.description ?? "");
  const normalizedOwnerEmail = normalizeEmail(resolveOwnerEmail(objective.owner, objective.ownerEmail));
  const normalizedPositionOwnerEmail = normalizeEmail(positionOwnerEmail);
  const normalizedUserEmail = normalizeEmail(signedInEmail);
  const isAdmin = adminEmails.map((entry) => normalizeEmail(entry)).includes(normalizedUserEmail);
  const canEdit =
    Boolean(normalizedUserEmail) &&
    (isAdmin || normalizedOwnerEmail === normalizedUserEmail || normalizedPositionOwnerEmail === normalizedUserEmail);

  useEffect(() => {
    setCode(objectiveCode);
    setTitle(objective.title);
    setOwner(resolveOwnerName(objective.owner));
    setOwnerEmail(resolveOwnerEmail(objective.owner, objective.ownerEmail));
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
    setOwner(resolveOwnerName(objective.owner));
    setOwnerEmail(resolveOwnerEmail(objective.owner, objective.ownerEmail));
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

    const numericProgressPct = Number(progressPct);
    if (!Number.isFinite(numericProgressPct)) {
      setError("Provide Progress %.");
      return;
    }

    const resolvedProgressPct = numericProgressPct;

    setIsSaving(true);
    setError("");

    const response = await fetch(apiPath(`/api/objectives/${encodeURIComponent(objective.objectiveKey)}`), {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-user-email": signedInEmail
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
      keyResults.length > 0
        ? `Delete objective '${objective.title}'? This will also delete ${keyResults.length} key result(s) and related check-ins.`
        : `Delete objective '${objective.title}'? This action cannot be undone.`;

    if (!window.confirm(warning)) {
      return;
    }

    setIsSaving(true);
    setError("");

    const response = await fetch(apiPath(`/api/objectives/${encodeURIComponent(objective.objectiveKey)}`), {
      method: "DELETE",
      headers: {
        "x-user-email": signedInEmail
      }
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
    <Fragment>
      <tr className={`board-objective-row ${isEditing ? "board-objective-row-editing" : ""}`}>
        <td className="board-objective-cell">
          {!isEditing ? (
            <div className="objective-code-emphasis">{objectiveCode}</div>
          ) : null}
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
            {!isEditing && canEdit ? (
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
          {!isEditing ? (
            <button
              type="button"
              className={`objective-kr-toggle ${isExpanded ? "is-open" : ""}`}
              aria-expanded={isExpanded}
              onClick={() => setIsExpanded((current) => !current)}
            >
              Key Results ({keyResults.length})
            </button>
          ) : null}
          {isEditing && canEdit ? (
            <input
              className="objective-row-input"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="OBJ-001"
              disabled={isSaving}
            />
          ) : null}
          {isEditing && canEdit ? (
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
          {isEditing && canEdit ? (
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
              placeholder="Owner (optional)"
            />
          ) : (
            objective.owner || "-"
          )}
        </td>
        <td>
          {isEditing && canEdit ? (
            <select
              className="objective-row-select"
              value={objectiveType}
              onChange={(event) => setObjectiveType(event.target.value as ObjectiveType)}
              disabled={isSaving}
            >
              {objectiveTypeOptions.map((option) => (
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
          {isEditing && canEdit ? (
            <select
              className="objective-row-select"
              value={status}
              onChange={(event) => setStatus(event.target.value as ObjectiveStatus)}
              disabled={isSaving}
            >
              {objectiveStatusOptions.map((option) => (
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
          {isEditing && canEdit ? (
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
          {isEditing && canEdit ? (
            <select
              className="objective-row-select"
              value={okrCycle}
              onChange={(event) => setOkrCycle(event.target.value as OkrCycle)}
              disabled={isSaving}
            >
              {objectiveCycleOptions.map((option) => (
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
          {isEditing && canEdit ? (
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
          {isEditing && canEdit ? (
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
          {isEditing && canEdit ? (
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
        <td>{formatDate(objective.lastCheckinAt)}</td>
      </tr>
      {isExpanded ? (
        <tr className="board-details-row">
          <td colSpan={11}>
            <div className="board-objective-details">
              <div className="board-objective-content">
                <DashboardKeyResultControls
                  objectiveKey={objective.objectiveKey}
                  periodKey={objective.periodKey}
                  defaultDueDate={objective.endDate}
                  defaultOwner={objective.owner || ""}
                  positionOwnerEmail={positionOwnerEmail}
                  adminEmails={adminEmails}
                  metricTypeOptions={metricTypeOptions}
                  keyResultStatusOptions={keyResultStatusOptions}
                  checkInFrequencyOptions={checkInFrequencyOptions}
                />
                <table className="board-subtable">
                  <thead>
                    <tr className="board-subheader-row">
                      <th>Key Result</th>
                      <th>Owner</th>
                      <th>KR Metric Type</th>
                      <th>Baseline Value</th>
                      <th>Target Value</th>
                      <th>Current Value</th>
                      <th>KR Progress %</th>
                      <th>KR Status</th>
                      <th>Due Date</th>
                      <th>Check-in Frequency</th>
                      <th>Blockers</th>
                      <th>Key Risks/Dependancy</th>
                      <th>Notes</th>
                      <th>Last updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keyResults.length === 0 ? (
                      <tr className="board-empty-row">
                        <td colSpan={14}>No key results for this objective yet.</td>
                      </tr>
                    ) : (
                      keyResults.map((item) => (
                        <DashboardKeyResultRowEditor
                          key={item.keyResult.krKey}
                          keyResult={item.keyResult}
                          objectiveKeyRisksDependency={objective.keyRisksDependency}
                          latestUpdateNotes={item.latestUpdateNotes}
                          latestUpdatedAt={item.latestUpdatedAt}
                          positionOwnerEmail={positionOwnerEmail}
                          adminEmails={adminEmails}
                          metricTypeOptions={metricTypeOptions}
                          keyResultStatusOptions={keyResultStatusOptions}
                          checkInFrequencyOptions={checkInFrequencyOptions}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}
