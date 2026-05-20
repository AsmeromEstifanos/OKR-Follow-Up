"use client";

import OwnerInput from "@/app/owner-input";
import useCurrentUserEmail from "@/app/use-current-user-email";
import { apiPath } from "@/lib/base-path";
import { resolveOwnerEmail, resolveOwnerName } from "@/lib/owner";
import type { CheckInFrequency, KeyResult, KrStatus, MetricType } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type ObjectiveOption = {
  objectiveKey: string;
  objectiveCode: string;
  title: string;
};

type KeyResultEditControlsProps = {
  keyResult: KeyResult;
  periodOptions: string[];
  objectiveOptions: ObjectiveOption[];
  metricTypeOptions: MetricType[];
  keyResultStatusOptions: KrStatus[];
  checkInFrequencyOptions: CheckInFrequency[];
};

type KrMode = "measurable" | "non-measurable";

type KeyResultDraft = {
  krCode: string;
  objectiveKey: string;
  periodKey: string;
  title: string;
  owner: string;
  ownerEmail: string;
  metricType: MetricType;
  krMode: KrMode;
  baselineValue: string;
  targetValue: string;
  currentValue: string;
  krProgress: string;
  krProgressPct: string;
  status: KrStatus;
  dueDate: string;
  checkInFrequency: CheckInFrequency;
  blockers: string;
  notes: string;
};

type ApiError = {
  error?: string;
};

type OwnerSuggestion = {
  displayName: string;
  principalName: string;
  mail: string;
};

function toDateInput(value: string | null): string {
  if (!value) {
    return "";
  }

  return value.slice(0, 10);
}

function toDraft(keyResult: KeyResult): KeyResultDraft {
  const isMeasurable = keyResult.targetValue !== null && keyResult.currentValue !== null;
  return {
    krCode: keyResult.krCode ?? keyResult.krKey,
    objectiveKey: keyResult.objectiveKey,
    periodKey: keyResult.periodKey,
    title: keyResult.title,
    owner: resolveOwnerName(keyResult.owner),
    ownerEmail: resolveOwnerEmail(keyResult.owner, keyResult.ownerEmail),
    metricType: keyResult.metricType,
    krMode: isMeasurable ? "measurable" : "non-measurable",
    baselineValue: isMeasurable ? String(keyResult.baselineValue ?? 0) : "0",
    targetValue: isMeasurable ? String(keyResult.targetValue) : "100",
    currentValue: isMeasurable ? String(keyResult.currentValue) : "0",
    krProgress: isMeasurable ? `${keyResult.currentValue} / ${keyResult.targetValue}` : "",
    krProgressPct: String(keyResult.progressPct),
    status: keyResult.status,
    dueDate: toDateInput(keyResult.dueDate),
    checkInFrequency: keyResult.checkInFrequency,
    blockers: keyResult.blockers ?? "",
    notes: keyResult.notes
  };
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
  if (!Number.isFinite(current) || !Number.isFinite(target) || target === 0) {
    return null;
  }

  return { current, target };
}

export default function KeyResultEditControls({
  keyResult,
  periodOptions,
  objectiveOptions,
  metricTypeOptions,
  keyResultStatusOptions,
  checkInFrequencyOptions
}: KeyResultEditControlsProps): JSX.Element {
  const router = useRouter();
  const currentUserEmail = useCurrentUserEmail();
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [draft, setDraft] = useState<KeyResultDraft>(() => toDraft(keyResult));
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");

  const availablePeriods = useMemo(() => {
    if (periodOptions.includes(keyResult.periodKey)) {
      return periodOptions;
    }

    return [keyResult.periodKey, ...periodOptions];
  }, [keyResult.periodKey, periodOptions]);
  const initialDraft = useMemo(() => toDraft(keyResult), [keyResult]);

  useEffect(() => {
    setDraft(toDraft(keyResult));
  }, [keyResult]);

  const handleSave = async (): Promise<void> => {
    setIsSaving(true);
    setMessage("");
    setError("");

    let patchBody: Record<string, unknown>;

    if (draft.krMode === "non-measurable") {
      const isDone = Number(draft.krProgressPct) >= 100;
      patchBody = {
        krCode: draft.krCode.trim(),
        objectiveKey: draft.objectiveKey.trim(),
        periodKey: draft.periodKey.trim(),
        title: draft.title.trim(),
        owner: draft.owner.trim(),
        ownerEmail: draft.ownerEmail.trim(),
        metricType: draft.metricType,
        baselineValue: null,
        targetValue: null,
        currentValue: null,
        progressPct: isDone ? 100 : 0,
        status: draft.status,
        dueDate: draft.dueDate,
        checkInFrequency: draft.checkInFrequency,
        blockers: draft.blockers.trim(),
        notes: draft.notes.trim()
      };
    } else {
      const baselineValue = Number(draft.baselineValue);
      let targetValue = Number(draft.targetValue);
      let currentValue = Number(draft.currentValue);

      if (!Number.isFinite(baselineValue) || !Number.isFinite(targetValue) || !Number.isFinite(currentValue)) {
        setError("Baseline, target, and current values must be valid numbers.");
        setIsSaving(false);
        return;
      }

      const progressChanged = draft.krProgress.trim() !== initialDraft.krProgress.trim();
      const progressPctChanged = draft.krProgressPct.trim() !== initialDraft.krProgressPct.trim();

      if (progressChanged) {
        const parsedProgress = parseProgressValue(draft.krProgress);
        if (!parsedProgress) {
          setError("KR Progress must use the format 'current / target' with valid numbers.");
          setIsSaving(false);
          return;
        }

        targetValue = parsedProgress.target;
        currentValue = parsedProgress.current;
      } else if (progressPctChanged) {
        const progressPctValue = Number(draft.krProgressPct);
        if (!Number.isFinite(progressPctValue)) {
          setError("KR Progress % must be a valid number.");
          setIsSaving(false);
          return;
        }

        currentValue = baselineValue + ((targetValue - baselineValue) * progressPctValue) / 100;
      }

      patchBody = {
        krCode: draft.krCode.trim(),
        objectiveKey: draft.objectiveKey.trim(),
        periodKey: draft.periodKey.trim(),
        title: draft.title.trim(),
        owner: draft.owner.trim(),
        ownerEmail: draft.ownerEmail.trim(),
        metricType: draft.metricType,
        baselineValue,
        targetValue,
        currentValue,
        status: draft.status,
        dueDate: draft.dueDate,
        checkInFrequency: draft.checkInFrequency,
        blockers: draft.blockers.trim(),
        notes: draft.notes.trim()
      };
    }

    const response = await fetch(apiPath(`/api/krs/${encodeURIComponent(keyResult.krKey)}`), {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-user-email": currentUserEmail
      },
      body: JSON.stringify(patchBody)
    });

    if (!response.ok) {
      const payload = (await response.json()) as ApiError;
      setError(payload.error ?? "Failed to update key result.");
      setIsSaving(false);
      return;
    }

    setMessage("Key result updated.");
    setIsSaving(false);
    router.refresh();
  };

  const handleReset = (): void => {
    setDraft(toDraft(keyResult));
    setMessage("");
    setError("");
  };

  return (
    <details className="kr-edit-card">
      <summary className="kr-edit-summary">
        {keyResult.title} ({keyResult.krKey})
      </summary>

      <div className="kr-edit-content">
        <div className="config-grid">
          <div className="field">
            <label htmlFor={`kr-code-${keyResult.krKey}`}>KR Code</label>
            <input
              id={`kr-code-${keyResult.krKey}`}
              value={draft.krCode}
              onChange={(event) => setDraft((current) => ({ ...current, krCode: event.target.value }))}
            />
          </div>

          <div className="field">
            <label htmlFor={`kr-objective-${keyResult.krKey}`}>Objective</label>
            <select
              id={`kr-objective-${keyResult.krKey}`}
              value={draft.objectiveKey}
              onChange={(event) => setDraft((current) => ({ ...current, objectiveKey: event.target.value }))}
            >
              {objectiveOptions.map((option) => (
                <option key={option.objectiveKey} value={option.objectiveKey}>
                  {option.title} ({option.objectiveCode})
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor={`kr-period-${keyResult.krKey}`}>Period</label>
            <select
              id={`kr-period-${keyResult.krKey}`}
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
            <label htmlFor={`kr-title-${keyResult.krKey}`}>Title</label>
            <input
              id={`kr-title-${keyResult.krKey}`}
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            />
          </div>

          <OwnerInput
            id={`kr-owner-${keyResult.krKey}`}
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
            <label htmlFor={`kr-owner-email-${keyResult.krKey}`}>Owner Email</label>
            <input id={`kr-owner-email-${keyResult.krKey}`} value={draft.ownerEmail} readOnly />
          </div>

          <div className="field">
            <label htmlFor={`kr-metric-${keyResult.krKey}`}>Metric Type</label>
            <select
              id={`kr-metric-${keyResult.krKey}`}
              value={draft.metricType}
              onChange={(event) => setDraft((current) => ({ ...current, metricType: event.target.value as MetricType }))}
            >
              {metricTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor={`kr-mode-${keyResult.krKey}`}>KR Type</label>
            <select
              id={`kr-mode-${keyResult.krKey}`}
              value={draft.krMode}
              onChange={(event) => setDraft((current) => ({
                ...current,
                krMode: event.target.value as KrMode,
                krProgressPct: current.krMode !== event.target.value && event.target.value === "non-measurable"
                  ? "0"
                  : current.krProgressPct
              }))}
            >
              <option value="measurable">Measurable</option>
              <option value="non-measurable">Non-measurable</option>
            </select>
          </div>

          {draft.krMode === "measurable" ? (
            <>
              <div className="field">
                <label htmlFor={`kr-baseline-${keyResult.krKey}`}>Baseline Value</label>
                <input
                  id={`kr-baseline-${keyResult.krKey}`}
                  type="number"
                  step="any"
                  value={draft.baselineValue}
                  onChange={(event) => setDraft((current) => ({ ...current, baselineValue: event.target.value }))}
                />
              </div>

              <div className="field">
                <label htmlFor={`kr-target-${keyResult.krKey}`}>Target Value</label>
                <input
                  id={`kr-target-${keyResult.krKey}`}
                  type="number"
                  step="any"
                  value={draft.targetValue}
                  onChange={(event) => setDraft((current) => ({ ...current, targetValue: event.target.value }))}
                />
              </div>

              <div className="field">
                <label htmlFor={`kr-current-${keyResult.krKey}`}>Current Value</label>
                <input
                  id={`kr-current-${keyResult.krKey}`}
                  type="number"
                  step="any"
                  value={draft.currentValue}
                  onChange={(event) => setDraft((current) => ({ ...current, currentValue: event.target.value }))}
                />
              </div>

              <div className="field">
                <label htmlFor={`kr-progress-${keyResult.krKey}`}>KR Progress</label>
                <input
                  id={`kr-progress-${keyResult.krKey}`}
                  value={draft.krProgress}
                  onChange={(event) => setDraft((current) => ({ ...current, krProgress: event.target.value }))}
                />
              </div>

              <div className="field">
                <label htmlFor={`kr-progress-pct-${keyResult.krKey}`}>KR Progress %</label>
                <input
                  id={`kr-progress-pct-${keyResult.krKey}`}
                  type="number"
                  step="any"
                  value={draft.krProgressPct}
                  onChange={(event) => setDraft((current) => ({ ...current, krProgressPct: event.target.value }))}
                />
              </div>
            </>
          ) : (
            <div className="field">
              <label>Progress</label>
              <button
                type="button"
                role="switch"
                aria-checked={Number(draft.krProgressPct) >= 100}
                className="ios-toggle"
                onClick={() => setDraft((current) => ({
                  ...current,
                  krProgressPct: Number(current.krProgressPct) >= 100 ? "0" : "100"
                }))}
              >
                <span className="ios-toggle-track"><span className="ios-toggle-thumb" /></span>
                <span className="ios-toggle-label">{Number(draft.krProgressPct) >= 100 ? "Done" : "Not Done"}</span>
              </button>
            </div>
          )}

          <div className="field">
            <label htmlFor={`kr-status-${keyResult.krKey}`}>Status</label>
            <select
              id={`kr-status-${keyResult.krKey}`}
              value={draft.status}
              onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as KrStatus }))}
            >
              {keyResultStatusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor={`kr-frequency-${keyResult.krKey}`}>Check-in Frequency</label>
            <select
              id={`kr-frequency-${keyResult.krKey}`}
              value={draft.checkInFrequency}
              onChange={(event) => setDraft((current) => ({ ...current, checkInFrequency: event.target.value as CheckInFrequency }))}
            >
              {checkInFrequencyOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor={`kr-due-date-${keyResult.krKey}`}>Due Date</label>
            <input
              id={`kr-due-date-${keyResult.krKey}`}
              type="date"
              value={draft.dueDate}
              onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))}
            />
          </div>

        </div>

        <div className="field">
          <label htmlFor={`kr-blockers-${keyResult.krKey}`}>Blockers</label>
          <textarea
            id={`kr-blockers-${keyResult.krKey}`}
            value={draft.blockers}
            onChange={(event) => setDraft((current) => ({ ...current, blockers: event.target.value }))}
          />
        </div>

        <div className="field">
          <label htmlFor={`kr-notes-${keyResult.krKey}`}>Notes</label>
          <textarea
            id={`kr-notes-${keyResult.krKey}`}
            value={draft.notes}
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
          />
        </div>

        <div className="actions">
          <button className="btn" type="button" disabled={isSaving} onClick={() => void handleSave()}>
            {isSaving ? "Saving..." : "Save KR"}
          </button>
          <button className="btn btn-danger" type="button" disabled={isSaving} onClick={handleReset}>
            Reset
          </button>
        </div>

        {message ? <p className="message">{message}</p> : null}
        {error ? <p className="message danger">{error}</p> : null}
      </div>
    </details>
  );
}
