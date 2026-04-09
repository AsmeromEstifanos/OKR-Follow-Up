"use client";

import OwnerInput from "@/app/owner-input";
import useCurrentUserEmail from "@/app/use-current-user-email";
import { apiPath } from "@/lib/base-path";
import { resolveOwnerEmail, resolveOwnerName } from "@/lib/owner";
import type { CheckInFrequency, KeyResult, KrStatus, MetricType } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  keyResult: KeyResult;
  objectiveKeyRisksDependency: string;
  latestUpdateNotes?: string;
  latestUpdatedAt?: string | null;
  positionOwnerEmail?: string;
  adminEmails: string[];
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

function formatStatus(value: KrStatus): string {
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

function formatCheckinFrequency(value: CheckInFrequency): string {
  if (value === "BiWeekly") {
    return "Bi-weekly";
  }

  if (value === "AdHoc") {
    return "Ad Hoc";
  }

  return value;
}

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString();
}

function formatMetricValue(value: number): string {
  return value.toLocaleString();
}

function toDateInput(value: string | null): string {
  if (!value) {
    return "";
  }

  return value.slice(0, 10);
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

export default function DashboardKeyResultRowEditor({
  keyResult,
  objectiveKeyRisksDependency,
  latestUpdateNotes,
  latestUpdatedAt,
  positionOwnerEmail,
  adminEmails,
  metricTypeOptions,
  keyResultStatusOptions,
  checkInFrequencyOptions
}: Props): JSX.Element {
  const router = useRouter();
  const signedInEmail = useCurrentUserEmail();
  const krCode = keyResult.krCode ?? keyResult.krKey;

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const [code, setCode] = useState<string>(krCode);
  const [title, setTitle] = useState<string>(keyResult.title);
  const [owner, setOwner] = useState<string>(resolveOwnerName(keyResult.owner));
  const [ownerEmail, setOwnerEmail] = useState<string>(resolveOwnerEmail(keyResult.owner, keyResult.ownerEmail));
  const [metricType, setMetricType] = useState<MetricType>(keyResult.metricType);
  const [baselineValue, setBaselineValue] = useState<string>(String(keyResult.baselineValue));
  const [targetValue, setTargetValue] = useState<string>(String(keyResult.targetValue));
  const [currentValue, setCurrentValue] = useState<string>(String(keyResult.currentValue));
  const [krProgressPct, setKrProgressPct] = useState<string>(String(keyResult.progressPct));
  const [status, setStatus] = useState<KrStatus>(keyResult.status);
  const [dueDate, setDueDate] = useState<string>(toDateInput(keyResult.dueDate));
  const [checkInFrequency, setCheckInFrequency] = useState<CheckInFrequency>(keyResult.checkInFrequency);
  const [blockers, setBlockers] = useState<string>(keyResult.blockers ?? "");
  const [notes, setNotes] = useState<string>(keyResult.notes || latestUpdateNotes || "");
  const normalizedOwnerEmail = normalizeEmail(resolveOwnerEmail(keyResult.owner, keyResult.ownerEmail));
  const normalizedPositionOwnerEmail = normalizeEmail(positionOwnerEmail);
  const normalizedUserEmail = normalizeEmail(signedInEmail);
  const isAdmin = adminEmails.map((entry) => normalizeEmail(entry)).includes(normalizedUserEmail);
  const canEdit =
    Boolean(normalizedUserEmail) &&
    (isAdmin || normalizedOwnerEmail === normalizedUserEmail || normalizedPositionOwnerEmail === normalizedUserEmail);

  useEffect(() => {
    setCode(krCode);
    setTitle(keyResult.title);
    setOwner(resolveOwnerName(keyResult.owner));
    setOwnerEmail(resolveOwnerEmail(keyResult.owner, keyResult.ownerEmail));
    setMetricType(keyResult.metricType);
    setBaselineValue(String(keyResult.baselineValue));
    setTargetValue(String(keyResult.targetValue));
    setCurrentValue(String(keyResult.currentValue));
    setKrProgressPct(String(keyResult.progressPct));
    setStatus(keyResult.status);
    setDueDate(toDateInput(keyResult.dueDate));
    setCheckInFrequency(keyResult.checkInFrequency);
    setBlockers(keyResult.blockers ?? "");
    setNotes(keyResult.notes || latestUpdateNotes || "");
  }, [keyResult, krCode, latestUpdateNotes, latestUpdatedAt]);

  const resetDraft = (): void => {
    setCode(krCode);
    setTitle(keyResult.title);
    setOwner(resolveOwnerName(keyResult.owner));
    setOwnerEmail(resolveOwnerEmail(keyResult.owner, keyResult.ownerEmail));
    setMetricType(keyResult.metricType);
    setBaselineValue(String(keyResult.baselineValue));
    setTargetValue(String(keyResult.targetValue));
    setCurrentValue(String(keyResult.currentValue));
    setKrProgressPct(String(keyResult.progressPct));
    setStatus(keyResult.status);
    setDueDate(toDateInput(keyResult.dueDate));
    setCheckInFrequency(keyResult.checkInFrequency);
    setBlockers(keyResult.blockers ?? "");
    setNotes(keyResult.notes || latestUpdateNotes || "");
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
      setError("Key Result title is required.");
      return;
    }

    const baseline = Number(baselineValue);
    let target = Number(targetValue);
    let current = Number(currentValue);

    if (!Number.isFinite(baseline) || !Number.isFinite(target) || !Number.isFinite(current)) {
      setError("Baseline, target, and current values must be numbers.");
      return;
    }

    if (!dueDate) {
      setError("Due date is required.");
      return;
    }

    const progressPctChanged = krProgressPct.trim() !== String(keyResult.progressPct).trim();

    if (progressPctChanged) {
      const progressPctValue = Number(krProgressPct);
      if (!Number.isFinite(progressPctValue)) {
        setError("KR Progress % must be a number.");
        return;
      }

      current = baseline + ((target - baseline) * progressPctValue) / 100;
    }

    setIsSaving(true);
    setError("");

    const response = await fetch(apiPath(`/api/krs/${encodeURIComponent(keyResult.krKey)}`), {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-user-email": signedInEmail
      },
      body: JSON.stringify({
        title: title.trim(),
        krCode: code.trim(),
        owner: owner.trim(),
        ownerEmail: ownerEmail.trim(),
        metricType,
        baselineValue: baseline,
        targetValue: target,
        currentValue: current,
        status,
        dueDate,
        checkInFrequency,
        blockers: blockers.trim(),
        notes: notes.trim()
      })
    });

    if (!response.ok) {
      const payload = await readJson<ApiError>(response);
      setError(payload?.error ?? "Failed to update key result.");
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    setIsEditing(false);
    router.refresh();
  };

  const deleteCurrentKeyResult = async (): Promise<void> => {
    if (isSaving) {
      return;
    }

    const warning = `Delete key result '${keyResult.title}'? Related check-ins will also be deleted.`;
    if (!window.confirm(warning)) {
      return;
    }

    setIsSaving(true);
    setError("");

    const response = await fetch(apiPath(`/api/krs/${encodeURIComponent(keyResult.krKey)}`), {
      method: "DELETE",
      headers: {
        "x-user-email": signedInEmail
      }
    });

    if (!response.ok) {
      const payload = await readJson<ApiError>(response);
      setError(payload?.error ?? "Failed to delete key result.");
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    setIsEditing(false);
    router.refresh();
  };

  return (
    <tr className={`board-kr-row ${isEditing ? "board-kr-row-editing" : ""}`}>
      <td className="board-subitem-cell">
        <div className="objective-title-wrap">
          {isEditing ? (
            <input
              className="objective-row-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Key Result"
              autoFocus
              disabled={isSaving}
            />
          ) : (
            <span className="objective-title-text">{keyResult.title}</span>
          )}
          {!isEditing && canEdit ? (
            <button
              type="button"
              className="objective-edit-trigger"
              aria-label={`Edit ${keyResult.title}`}
              title="Edit key result"
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
        <div className="board-meta">{krCode}</div>
        {isEditing && canEdit ? (
          <input
            className="objective-row-input"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="KR-001"
            disabled={isSaving}
          />
        ) : null}
        {isEditing && canEdit ? (
          <div className="objective-row-actions">
            <button className="btn" type="button" onClick={() => void saveEdit()} disabled={isSaving}>
              Save
            </button>
            <button className="btn btn-danger" type="button" onClick={() => void deleteCurrentKeyResult()} disabled={isSaving}>
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
          <>
            <OwnerInput
              id={`kr-owner-inline-${keyResult.krKey}`}
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
            <input
              className="objective-row-input"
              value={ownerEmail}
              readOnly
              disabled={isSaving}
              aria-label={`Owner email for ${keyResult.title}`}
            />
          </>
        ) : (
          keyResult.owner || "-"
        )}
      </td>
      <td>
        {isEditing && canEdit ? (
          <select
            className="objective-row-select"
            value={metricType}
            onChange={(event) => setMetricType(event.target.value as MetricType)}
            disabled={isSaving}
          >
            {metricTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          keyResult.metricType
        )}
      </td>
      <td>
        {isEditing && canEdit ? (
          <input
            className="objective-row-input"
            type="number"
            step="any"
            value={baselineValue}
            onChange={(event) => setBaselineValue(event.target.value)}
            disabled={isSaving}
          />
        ) : (
          formatMetricValue(keyResult.baselineValue)
        )}
      </td>
      <td>
        {isEditing && canEdit ? (
          <input
            className="objective-row-input"
            type="number"
            step="any"
            value={targetValue}
            onChange={(event) => setTargetValue(event.target.value)}
            disabled={isSaving}
          />
        ) : (
          formatMetricValue(keyResult.targetValue)
        )}
      </td>
      <td>
        {isEditing && canEdit ? (
          <input
            className="objective-row-input"
            type="number"
            step="any"
            value={currentValue}
            onChange={(event) => setCurrentValue(event.target.value)}
            disabled={isSaving}
          />
        ) : (
          formatMetricValue(keyResult.currentValue)
        )}
      </td>
      <td>
        {isEditing && canEdit ? (
          <input
            className="objective-row-input"
            type="number"
            step="any"
            value={krProgressPct}
            onChange={(event) => setKrProgressPct(event.target.value)}
            disabled={isSaving}
          />
        ) : (
          `${keyResult.progressPct}%`
        )}
      </td>
      <td>
        {isEditing && canEdit ? (
          <select
            className="objective-row-select"
            value={status}
            onChange={(event) => setStatus(event.target.value as KrStatus)}
            disabled={isSaving}
          >
            {keyResultStatusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          formatStatus(keyResult.status)
        )}
      </td>
      <td>
        {isEditing && canEdit ? (
          <input
            className="objective-row-input"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            disabled={isSaving}
          />
        ) : (
          formatDate(keyResult.dueDate)
        )}
      </td>
      <td>
        {isEditing && canEdit ? (
          <select
            className="objective-row-select"
            value={checkInFrequency}
            onChange={(event) => setCheckInFrequency(event.target.value as CheckInFrequency)}
            disabled={isSaving}
          >
            {checkInFrequencyOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          formatCheckinFrequency(keyResult.checkInFrequency)
        )}
      </td>
      <td>
        {isEditing && canEdit ? (
          <input
            className="objective-row-input"
            value={blockers}
            onChange={(event) => setBlockers(event.target.value)}
            disabled={isSaving}
          />
        ) : (
          keyResult.blockers || "-"
        )}
      </td>
      <td>{objectiveKeyRisksDependency || "-"}</td>
      <td>
        {isEditing && canEdit ? (
          <input className="objective-row-input" value={notes} onChange={(event) => setNotes(event.target.value)} disabled={isSaving} />
        ) : (
          keyResult.notes || latestUpdateNotes || "-"
        )}
      </td>
      <td>
        {formatDate(latestUpdatedAt ?? keyResult.lastCheckinAt)}
      </td>
    </tr>
  );
}
