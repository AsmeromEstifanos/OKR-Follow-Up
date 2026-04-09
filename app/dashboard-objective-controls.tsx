"use client";

import OwnerInput from "@/app/owner-input";
import useCurrentUserEmail from "@/app/use-current-user-email";
import { apiPath } from "@/lib/base-path";
import { beginOperationBatch } from "@/lib/client-operation-batch";
import type { ObjectiveStatus, ObjectiveType, OkrCycle } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  positionName: string;
  strategicTheme: string;
  defaultPeriodKey?: string;
  defaultStartDate?: string;
  defaultEndDate?: string;
  defaultCycle: string;
  defaultOwner: string;
  positionOwnerEmail?: string;
  adminEmails: string[];
  objectiveTypeOptions: ObjectiveType[];
  objectiveStatusOptions: ObjectiveStatus[];
  objectiveCycleOptions: OkrCycle[];
};

type ApiError = {
  error?: string;
};

type OwnerSuggestion = {
  displayName: string;
  principalName: string;
  mail: string;
};

type PendingObjective = {
  title: string;
  owner: string;
  ownerEmail: string;
  objectiveType: ObjectiveType;
  status: ObjectiveStatus;
  progressPct: number;
  okrCycle: OkrCycle;
  blockers: string;
  keyRisksDependency: string;
  notes: string;
};

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

function normalizeEmail(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function getNextDisplayCode(code: string, fallbackPrefix: string): string {
  const match = /^([A-Z]+)-(\d+)$/i.exec(code.trim());
  if (!match) {
    return `${fallbackPrefix}-001`;
  }

  const prefix = match[1].toUpperCase();
  const numeric = Number(match[2]);
  if (!Number.isInteger(numeric) || numeric < 1) {
    return `${prefix}-001`;
  }

  return `${prefix}-${String(numeric + 1).padStart(match[2].length, "0")}`;
}

export default function DashboardObjectiveControls({
  positionName,
  strategicTheme,
  defaultPeriodKey,
  defaultStartDate,
  defaultEndDate,
  defaultCycle,
  defaultOwner,
  positionOwnerEmail,
  adminEmails,
  objectiveTypeOptions,
  objectiveStatusOptions,
  objectiveCycleOptions
}: Props): JSX.Element {
  const router = useRouter();
  const signedInEmail = useCurrentUserEmail();
  const normalizedUserEmail = normalizeEmail(signedInEmail);
  const normalizedPositionOwnerEmail = normalizeEmail(positionOwnerEmail);
  const isAdmin = adminEmails.map((entry) => normalizeEmail(entry)).includes(normalizedUserEmail);
  const canCreate = Boolean(normalizedUserEmail) && (isAdmin || normalizedUserEmail === normalizedPositionOwnerEmail);
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [title, setTitle] = useState<string>("");
  const [owner, setOwner] = useState<string>(defaultOwner);
  const [ownerEmail, setOwnerEmail] = useState<string>("");
  const [objectiveCodePreview, setObjectiveCodePreview] = useState<string>("");
  const [objectiveType, setObjectiveType] = useState<ObjectiveType>(objectiveTypeOptions[0] ?? "Committed");
  const [status, setStatus] = useState<ObjectiveStatus>(objectiveStatusOptions[0] ?? "NotStarted");
  const [progress, setProgress] = useState<string>("0");
  const [progressPct, setProgressPct] = useState<string>("0");
  const [okrCycle, setOkrCycle] = useState<OkrCycle>(objectiveCycleOptions[0] ?? defaultCycle);
  const [blockers, setBlockers] = useState<string>("");
  const [keyRisksDependency, setKeyRisksDependency] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [pendingObjectives, setPendingObjectives] = useState<PendingObjective[]>([]);
  const [error, setError] = useState<string>("");

  const loadObjectiveCodePreview = async (): Promise<void> => {
    const params = new URLSearchParams({
      department: positionName,
      ventureName: strategicTheme,
      strategicTheme
    });

    const response = await fetch(apiPath(`/api/codes/objective?${params.toString()}`), { cache: "no-store" });
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
    setObjectiveType(objectiveTypeOptions[0] ?? "Committed");
    setStatus(objectiveStatusOptions[0] ?? "NotStarted");
    setProgress("0");
    setProgressPct("0");
    setOkrCycle(objectiveCycleOptions[0] ?? defaultCycle);
    setBlockers("");
    setKeyRisksDependency("");
    setNotes("");
    setPendingObjectives([]);
    setIsAdding(true);
  };

  const resetDraftForNextObjective = (): void => {
    setTitle("");
    setOwner("");
    setOwnerEmail("");
    setObjectiveType(objectiveTypeOptions[0] ?? "Committed");
    setStatus(objectiveStatusOptions[0] ?? "NotStarted");
    setProgress("0");
    setProgressPct("0");
    setOkrCycle(objectiveCycleOptions[0] ?? defaultCycle);
    setBlockers("");
    setKeyRisksDependency("");
    setNotes("");
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
    setObjectiveType(objectiveTypeOptions[0] ?? "Committed");
    setStatus(objectiveStatusOptions[0] ?? "NotStarted");
    setProgress("0");
    setProgressPct("0");
    setOkrCycle(objectiveCycleOptions[0] ?? defaultCycle);
    setBlockers("");
    setKeyRisksDependency("");
    setNotes("");
    setPendingObjectives([]);
    setIsAdding(false);
  };

  useEffect(() => {
    if (!isAdding) {
      return;
    }

    void loadObjectiveCodePreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdding, positionName, strategicTheme]);

  const buildPendingObjective = (): PendingObjective | null => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Objective title is required.");
      return null;
    }
    if (!defaultPeriodKey) {
      setError("No period is configured.");
      return null;
    }

    const startDate = defaultStartDate ?? todayPlus(0);
    const endDate = defaultEndDate ?? todayPlus(90);
    const rawProgress = Number(progress);
    const rawProgressPct = Number(progressPct);
    const hasProgress = Number.isFinite(rawProgress);
    const hasProgressPct = Number.isFinite(rawProgressPct);

    if (!hasProgress && !hasProgressPct) {
      setError("Provide Progress or Progress %.");
      return null;
    }

    const resolvedProgressPct = hasProgressPct ? rawProgressPct : rawProgress;
    return {
      title: trimmedTitle,
      owner: owner.trim(),
      ownerEmail: ownerEmail.trim(),
      objectiveType,
      status,
      progressPct: Math.min(100, Math.max(0, resolvedProgressPct)),
      okrCycle,
      blockers: blockers.trim(),
      keyRisksDependency: keyRisksDependency.trim(),
      notes: notes.trim()
    };
  };

  const queueObjective = (): void => {
    const draft = buildPendingObjective();
    if (!draft) {
      return;
    }

    setPendingObjectives((current) => [...current, draft]);
    resetDraftForNextObjective();
    setError("");
    setObjectiveCodePreview((current) => getNextDisplayCode(current, "OBJ"));
  };

  const removeQueuedObjective = (index: number): void => {
    setPendingObjectives((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const saveAllObjectives = async (): Promise<void> => {
    if (isSaving) {
      return;
    }

    if (!defaultPeriodKey) {
      setError("No period is configured.");
      return;
    }

    const staged = [...pendingObjectives];
    if (staged.length === 0 && title.trim()) {
      const current = buildPendingObjective();
      if (!current) {
        return;
      }

      staged.push(current);
    }

    if (staged.length === 0) {
      setError("Add at least one objective first.");
      return;
    }

    const startDate = defaultStartDate ?? todayPlus(0);
    const endDate = defaultEndDate ?? todayPlus(90);
    setIsSaving(true);
    setError("");
    const batch = beginOperationBatch("Saving objectives", staged.length);

    try {
      for (let index = 0; index < staged.length; index += 1) {
        batch.setCurrentStep(index + 1);
        const item = staged[index];
        const response = await fetch(apiPath("/api/objectives"), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-user-email": signedInEmail
          },
          body: JSON.stringify({
            periodKey: defaultPeriodKey,
            title: item.title,
            description: item.notes,
            owner: item.owner,
            ownerEmail: item.ownerEmail,
            department: positionName,
            ventureName: strategicTheme,
            strategicTheme,
            objectiveType: item.objectiveType,
            okrCycle: item.okrCycle,
            blockers: item.blockers,
            keyRisksDependency: item.keyRisksDependency,
            notes: item.notes,
            status: item.status,
            progressPct: item.progressPct,
            confidence: "Medium",
            rag: "Amber",
            startDate,
            endDate
          })
        });
        const payload = await readJson<ApiError>(response);

        if (!response.ok) {
          setError(payload?.error ?? `Failed to add objective at line ${index + 1}.`);
          setIsSaving(false);
          batch.finish();
          return;
        }
      }

      batch.finish();
      setIsSaving(false);
      setPendingObjectives([]);
      closeAdd();
      setError("");
      router.refresh();
    } catch (error) {
      batch.finish();
      setError(error instanceof Error ? error.message : "Failed to save objectives.");
      setIsSaving(false);
      return;
    }
  };

  return (
    <div className="objective-controls">
      {canCreate ? (
        <button
          className={`tab-btn tab-btn-add objective-add-btn ${isAdding ? "tab-btn-active" : ""}`}
          type="button"
          onClick={isAdding ? closeAdd : openAdd}
          disabled={isSaving}
        >
          Add Objective
        </button>
      ) : null}
      {canCreate && isAdding ? (
        <form
          className="objective-form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveAllObjectives();
          }}
        >
          <div className="objective-form-grid">
            <div className="field">
              <label>Objective Code</label>
              <input
                name="objectiveCode"
                value={objectiveCodePreview}
                readOnly
                aria-label={`Objective code for ${positionName}`}
                disabled={isSaving}
              />
            </div>
            <OwnerInput
              id={`objective-owner-${positionName.replace(/\s+/g, "-").toLowerCase()}`}
              label="Owner (optional)"
              value={owner}
              onChange={setOwner}
              onSelectUser={(user: OwnerSuggestion | null) => {
                setOwnerEmail(user ? user.mail || user.principalName : "");
              }}
              disabled={isSaving}
              placeholder="Owner (optional)"
            />
            <div className="field">
              <label>Owner Email</label>
              <input name="objectiveOwnerEmail" value={ownerEmail} readOnly disabled={isSaving} />
            </div>
            <div className="field objective-field-wide">
              <label>Objective</label>
              <textarea
                name="objectiveTitle"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Objective"
                aria-label={`Objective title for ${positionName}`}
                autoFocus
                disabled={isSaving}
              />
            </div>
            <div className="field">
              <label>Objective Type</label>
              <select
                name="objectiveType"
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
            </div>
            <div className="field">
              <label>Health</label>
              <select
                name="objectiveStatus"
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
            </div>
            <div className="field">
              <label>Progress</label>
              <input
                name="objectiveProgress"
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
                name="objectiveProgressPct"
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
              <select
                name="objectiveCycle"
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
            </div>
            <div className="field objective-field-wide">
              <label>Blockers</label>
              <textarea
                name="objectiveBlockers"
                value={blockers}
                onChange={(event) => setBlockers(event.target.value)}
                placeholder="Current blockers"
                disabled={isSaving}
              />
            </div>
            <div className="field objective-field-wide">
              <label>Key Risks/Dependancy</label>
              <input
                name="objectiveKeyRisksDependency"
                value={keyRisksDependency}
                onChange={(event) => setKeyRisksDependency(event.target.value)}
                placeholder="Key risks/dependencies"
                disabled={isSaving}
              />
            </div>
            <div className="field objective-field-wide">
              <label>Notes</label>
              <textarea name="objectiveNotes" value={notes} onChange={(event) => setNotes(event.target.value)} disabled={isSaving} />
            </div>
          </div>
          <div className="actions">
            <button className="btn" type="button" onClick={queueObjective} disabled={isSaving}>
              Add More
            </button>
            <button className="btn btn-add" type="submit" disabled={isSaving}>
              Save All{pendingObjectives.length > 0 ? ` (${pendingObjectives.length})` : ""}
            </button>
            <button className="tab-btn" type="button" onClick={closeAdd} disabled={isSaving}>
              Cancel
            </button>
          </div>
          {pendingObjectives.length > 0 ? (
            <div className="field objective-field-wide">
              <label>Pending Objectives</label>
              <ul>
                {pendingObjectives.map((item, index) => (
                  <li key={`${item.title}-${index}`}>
                    {item.title}{" "}
                    <button type="button" className="tab-btn" onClick={() => removeQueuedObjective(index)} disabled={isSaving}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <p className="message">You have {pendingObjectives.length} unsaved objective(s). Click Save All.</p>
            </div>
          ) : null}
        </form>
      ) : null}
      {error ? <p className="message danger">{error}</p> : null}
    </div>
  );
}
