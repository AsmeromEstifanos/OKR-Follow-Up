"use client";

import OwnerInput from "@/app/owner-input";
import useCurrentUserEmail from "@/app/use-current-user-email";
import { apiPath } from "@/lib/base-path";
import { resolveOwnerEmail, resolveOwnerName } from "@/lib/owner";
import type { Confidence, Objective, ObjectiveStatus, ObjectiveType, OkrCycle } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type ObjectiveEditControlsProps = {
  objective: Objective;
  periodOptions: string[];
  departmentOptions: string[];
  objectiveTypeOptions: ObjectiveType[];
  objectiveStatusOptions: ObjectiveStatus[];
  objectiveCycleOptions: OkrCycle[];
};

type ObjectiveDraft = {
  periodKey: string;
  objectiveCode: string;
  title: string;
  description: string;
  owner: string;
  ownerEmail: string;
  department: string;
  strategicTheme: string;
  objectiveType: ObjectiveType;
  okrCycle: OkrCycle;
  blockers: string;
  keyRisksDependency: string;
  notes: string;
  status: ObjectiveStatus;
  confidence: Confidence;
  progressValue: string;
  progressPct: string;
  startDate: string;
  endDate: string;
};

type ApiError = {
  error?: string;
};

type OwnerSuggestion = {
  displayName: string;
  principalName: string;
  mail: string;
};

const CONFIDENCE_OPTIONS: Confidence[] = ["High", "Medium", "Low"];

function toDateInput(value: string): string {
  if (!value) {
    return "";
  }

  return value.slice(0, 10);
}

function toDraft(objective: Objective): ObjectiveDraft {
  return {
    periodKey: objective.periodKey,
    objectiveCode: objective.objectiveCode ?? objective.objectiveKey,
    title: objective.title,
    description: objective.description,
    owner: resolveOwnerName(objective.owner),
    ownerEmail: resolveOwnerEmail(objective.owner, objective.ownerEmail),
    department: objective.department,
    strategicTheme: objective.strategicTheme,
    objectiveType: objective.objectiveType,
    okrCycle: objective.okrCycle,
    blockers: objective.blockers ?? "",
    keyRisksDependency: objective.keyRisksDependency,
    notes: objective.notes,
    status: objective.status,
    confidence: objective.confidence,
    progressValue: String(Math.round(objective.progressPct)),
    progressPct: String(objective.progressPct),
    startDate: toDateInput(objective.startDate),
    endDate: toDateInput(objective.endDate)
  };
}

export default function ObjectiveEditControls({
  objective,
  periodOptions,
  departmentOptions,
  objectiveTypeOptions,
  objectiveStatusOptions,
  objectiveCycleOptions
}: ObjectiveEditControlsProps): JSX.Element {
  const router = useRouter();
  const currentUserEmail = useCurrentUserEmail();
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [draft, setDraft] = useState<ObjectiveDraft>(() => toDraft(objective));
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");

  const availablePeriods = useMemo(() => {
    if (periodOptions.includes(objective.periodKey)) {
      return periodOptions;
    }

    return [objective.periodKey, ...periodOptions];
  }, [objective.periodKey, periodOptions]);

  useEffect(() => {
    setDraft(toDraft(objective));
  }, [objective]);

  const handleSave = async (): Promise<void> => {
    setIsSaving(true);
    setMessage("");
    setError("");

    const parsedProgressValue = Number(draft.progressValue);
    const parsedProgressPct = Number(draft.progressPct);
    const hasProgressPct = Number.isFinite(parsedProgressPct);
    const hasProgressValue = Number.isFinite(parsedProgressValue);

    if (!hasProgressPct && !hasProgressValue) {
      setError("Provide Progress or Progress % as a valid number.");
      setIsSaving(false);
      return;
    }

    const resolvedProgressPct = hasProgressPct ? parsedProgressPct : parsedProgressValue;

    const response = await fetch(apiPath(`/api/objectives/${encodeURIComponent(objective.objectiveKey)}`), {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-user-email": currentUserEmail
      },
      body: JSON.stringify({
        periodKey: draft.periodKey.trim(),
        objectiveCode: draft.objectiveCode.trim(),
        title: draft.title.trim(),
        description: draft.description.trim(),
        owner: draft.owner.trim(),
        ownerEmail: draft.ownerEmail.trim(),
        department: draft.department.trim(),
        strategicTheme: draft.strategicTheme.trim(),
        objectiveType: draft.objectiveType,
        okrCycle: draft.okrCycle,
        blockers: draft.blockers.trim(),
        keyRisksDependency: draft.keyRisksDependency.trim(),
        notes: draft.notes.trim(),
        status: draft.status,
        confidence: draft.confidence,
        progressPct: resolvedProgressPct,
        startDate: draft.startDate,
        endDate: draft.endDate
      })
    });

    if (!response.ok) {
      const payload = (await response.json()) as ApiError;
      setError(payload.error ?? "Failed to update objective.");
      setIsSaving(false);
      return;
    }

    setMessage("Objective updated.");
    setIsSaving(false);
    setIsEditing(false);
    router.refresh();
  };

  const handleCancel = (): void => {
    setDraft(toDraft(objective));
    setError("");
    setMessage("");
    setIsEditing(false);
  };

  return (
    <div className="form-grid">
      {!isEditing ? (
        <div className="actions">
          <button className="btn" type="button" onClick={() => setIsEditing(true)}>
            Edit Objective
          </button>
        </div>
      ) : (
        <>
          <div className="config-grid">
            <div className="field">
              <label htmlFor="objective-code-edit">Objective Code</label>
              <input
                id="objective-code-edit"
                value={draft.objectiveCode}
                onChange={(event) => setDraft((current) => ({ ...current, objectiveCode: event.target.value }))}
              />
            </div>

            <div className="field">
              <label htmlFor="objective-period-edit">Period</label>
              <select
                id="objective-period-edit"
                value={draft.periodKey}
                onChange={(event) => setDraft((current) => ({ ...current, periodKey: event.target.value }))}
              >
                {availablePeriods.map((periodKey) => (
                  <option key={periodKey} value={periodKey}>
                    {periodKey}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="objective-title-edit">Title</label>
              <input
                id="objective-title-edit"
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              />
            </div>

            <OwnerInput
              id="objective-owner-edit"
              label="Owner (optional)"
              value={draft.owner}
              onChange={(next) => setDraft((current) => ({ ...current, owner: next }))}
              onSelectUser={(user: OwnerSuggestion | null) => {
                setDraft((current) => ({
                  ...current,
                  ownerEmail: user ? user.mail || user.principalName : ""
                }));
              }}
              placeholder="Owner (optional)"
            />
            <div className="field">
              <label htmlFor="objective-owner-email-edit">Owner Email</label>
              <input id="objective-owner-email-edit" value={draft.ownerEmail} readOnly />
            </div>

            <div className="field">
              <label htmlFor="objective-department-edit">Department</label>
              <input
                id="objective-department-edit"
                list="objective-department-options"
                value={draft.department}
                onChange={(event) => setDraft((current) => ({ ...current, department: event.target.value }))}
              />
              <datalist id="objective-department-options">
                {departmentOptions.map((departmentName) => (
                  <option key={departmentName} value={departmentName} />
                ))}
              </datalist>
            </div>

            <div className="field">
              <label htmlFor="objective-theme-edit">Strategic Theme</label>
              <input
                id="objective-theme-edit"
                value={draft.strategicTheme}
                onChange={(event) => setDraft((current) => ({ ...current, strategicTheme: event.target.value }))}
              />
            </div>

            <div className="field">
              <label htmlFor="objective-type-edit">Objective Type</label>
              <select
                id="objective-type-edit"
                value={draft.objectiveType}
                onChange={(event) => setDraft((current) => ({ ...current, objectiveType: event.target.value as ObjectiveType }))}
              >
                {objectiveTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="objective-cycle-edit">OKR Cycle</label>
              <select
                id="objective-cycle-edit"
                value={draft.okrCycle}
                onChange={(event) => setDraft((current) => ({ ...current, okrCycle: event.target.value as OkrCycle }))}
              >
                {objectiveCycleOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="objective-status-edit">Status</label>
              <select
                id="objective-status-edit"
                value={draft.status}
                onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as ObjectiveStatus }))}
              >
                {objectiveStatusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="objective-confidence-edit">Confidence</label>
              <select
                id="objective-confidence-edit"
                value={draft.confidence}
                onChange={(event) => setDraft((current) => ({ ...current, confidence: event.target.value as Confidence }))}
              >
                {CONFIDENCE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="objective-progress-edit">Progress</label>
              <input
                id="objective-progress-edit"
                type="number"
                step="any"
                value={draft.progressValue}
                onChange={(event) => setDraft((current) => ({ ...current, progressValue: event.target.value }))}
              />
            </div>

            <div className="field">
              <label htmlFor="objective-progress-pct-edit">Progress %</label>
              <input
                id="objective-progress-pct-edit"
                type="number"
                step="any"
                value={draft.progressPct}
                onChange={(event) => setDraft((current) => ({ ...current, progressPct: event.target.value }))}
              />
            </div>

            <div className="field">
              <label htmlFor="objective-start-edit">Start Date</label>
              <input
                id="objective-start-edit"
                type="date"
                value={draft.startDate}
                onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))}
              />
            </div>

            <div className="field">
              <label htmlFor="objective-end-edit">End Date</label>
              <input
                id="objective-end-edit"
                type="date"
                value={draft.endDate}
                onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))}
              />
            </div>

          </div>

          <div className="field">
            <label htmlFor="objective-description-edit">Description</label>
            <textarea
              id="objective-description-edit"
              value={draft.description}
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
            />
          </div>

          <div className="field">
            <label htmlFor="objective-notes-edit">Notes</label>
            <textarea
              id="objective-notes-edit"
              value={draft.notes}
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            />
          </div>

          <div className="field">
            <label htmlFor="objective-blockers-edit">Blockers</label>
            <textarea
              id="objective-blockers-edit"
              value={draft.blockers}
              onChange={(event) => setDraft((current) => ({ ...current, blockers: event.target.value }))}
            />
          </div>

          <div className="field">
            <label htmlFor="objective-risks-edit">Key Risks/Dependancy</label>
            <textarea
              id="objective-risks-edit"
              value={draft.keyRisksDependency}
              onChange={(event) => setDraft((current) => ({ ...current, keyRisksDependency: event.target.value }))}
            />
          </div>

          <div className="actions">
            <button className="btn" type="button" disabled={isSaving} onClick={() => void handleSave()}>
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
            <button className="btn btn-danger" type="button" disabled={isSaving} onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </>
      )}

      {message ? <p className="message">{message}</p> : null}
      {error ? <p className="message danger">{error}</p> : null}
    </div>
  );
}
