"use client";

import OwnerInput from "@/app/owner-input";
import useCurrentUserEmail from "@/app/use-current-user-email";
import { apiPath } from "@/lib/base-path";
import { beginOperationBatch } from "@/lib/client-operation-batch";
import type { CheckInFrequency, KrStatus, MetricType } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  objectiveKey: string;
  periodKey: string;
  defaultDueDate: string;
  defaultOwner: string;
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

type PendingKr = {
  title: string;
  owner: string;
  ownerEmail: string;
  metricType: MetricType;
  baselineValue: number;
  targetValue: number;
  currentValue: number;
  status: KrStatus;
  dueDate: string;
  checkInFrequency: CheckInFrequency;
  blockers: string;
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

function toDateInput(value: string): string {
  if (!value) {
    return "";
  }

  return value.slice(0, 10);
}

function sanitizeDefaultOwner(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return "";
  }

  if (normalized.toLowerCase().includes("@contoso")) {
    return "";
  }

  return normalized;
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

export default function DashboardKeyResultControls({
  objectiveKey,
  periodKey,
  defaultDueDate,
  defaultOwner,
  positionOwnerEmail,
  adminEmails,
  metricTypeOptions,
  keyResultStatusOptions,
  checkInFrequencyOptions
}: Props): JSX.Element {
  const router = useRouter();
  const signedInEmail = useCurrentUserEmail();
  const normalizedUserEmail = normalizeEmail(signedInEmail);
  const normalizedPositionOwnerEmail = normalizeEmail(positionOwnerEmail);
  const isAdmin = adminEmails.map((entry) => normalizeEmail(entry)).includes(normalizedUserEmail);
  const canCreate = Boolean(normalizedUserEmail) && (isAdmin || normalizedUserEmail === normalizedPositionOwnerEmail);
  const sanitizedDefaultOwner = sanitizeDefaultOwner(defaultOwner);
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [krCodePreview, setKrCodePreview] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [owner, setOwner] = useState<string>(sanitizedDefaultOwner);
  const [ownerEmail, setOwnerEmail] = useState<string>("");
  const [metricType, setMetricType] = useState<MetricType>(metricTypeOptions[0] ?? "Operational");
  const [baselineValue, setBaselineValue] = useState<string>("0");
  const [targetValue, setTargetValue] = useState<string>("100");
  const [currentValue, setCurrentValue] = useState<string>("0");
  const [status, setStatus] = useState<KrStatus>(keyResultStatusOptions[0] ?? "NotStarted");
  const [dueDate, setDueDate] = useState<string>(toDateInput(defaultDueDate));
  const [checkInFrequency, setCheckInFrequency] = useState<CheckInFrequency>(checkInFrequencyOptions[0] ?? "Weekly");
  const [blockers, setBlockers] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [pendingKrs, setPendingKrs] = useState<PendingKr[]>([]);
  const [error, setError] = useState<string>("");

  const loadKrCodePreview = async (): Promise<void> => {
    const response = await fetch(apiPath(`/api/codes/kr?objectiveKey=${encodeURIComponent(objectiveKey)}`), { cache: "no-store" });
    if (!response.ok) {
      setKrCodePreview("KR-001");
      return;
    }

    const payload = (await response.json()) as { code?: string };
    setKrCodePreview(payload.code?.trim() || "KR-001");
  };

  const openAdd = (): void => {
    setError("");
    void loadKrCodePreview();
    setIsAdding(true);
  };

  const resetDraftForNextKr = (): void => {
    setTitle("");
    setOwner("");
    setOwnerEmail("");
    setMetricType(metricTypeOptions[0] ?? "Operational");
    setBaselineValue("0");
    setTargetValue("100");
    setCurrentValue("0");
    setStatus(keyResultStatusOptions[0] ?? "NotStarted");
    setDueDate(toDateInput(defaultDueDate));
    setCheckInFrequency(checkInFrequencyOptions[0] ?? "Weekly");
    setBlockers("");
    setNotes("");
  };

  const closeAdd = (): void => {
    if (isSaving) {
      return;
    }

    setError("");
    setIsAdding(false);
    setKrCodePreview("");
    setTitle("");
    setOwner(sanitizedDefaultOwner);
    setOwnerEmail("");
    setMetricType(metricTypeOptions[0] ?? "Operational");
    setBaselineValue("0");
    setTargetValue("100");
    setCurrentValue("0");
    setStatus(keyResultStatusOptions[0] ?? "NotStarted");
    setDueDate(toDateInput(defaultDueDate));
    setCheckInFrequency(checkInFrequencyOptions[0] ?? "Weekly");
    setBlockers("");
    setNotes("");
    setPendingKrs([]);
  };

  useEffect(() => {
    if (!isAdding) {
      return;
    }

    void loadKrCodePreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdding, objectiveKey]);

  useEffect(() => {
    if (!isAdding) {
      setOwner(sanitizedDefaultOwner);
      setOwnerEmail("");
    }
  }, [isAdding, sanitizedDefaultOwner]);

  const buildPendingKr = (): PendingKr | null => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Key Result title is required.");
      return null;
    }

    const baseline = Number(baselineValue);
    const target = Number(targetValue);
    const current = Number(currentValue);
    if (!Number.isFinite(baseline) || !Number.isFinite(target) || !Number.isFinite(current)) {
      setError("Baseline, target, and current values must be numbers.");
      return null;
    }

    if (!dueDate) {
      setError("Due date is required.");
      return null;
    }

    return {
      title: trimmedTitle,
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
    };
  };

  const queueKr = (): void => {
    const draft = buildPendingKr();
    if (!draft) {
      return;
    }

    setPendingKrs((current) => [...current, draft]);
    resetDraftForNextKr();
    setError("");
    setKrCodePreview((current) => getNextDisplayCode(current, "KR"));
  };

  const removeQueuedKr = (index: number): void => {
    setPendingKrs((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const saveAllKrs = async (): Promise<void> => {
    if (isSaving) {
      return;
    }

    const staged = [...pendingKrs];
    if (staged.length === 0 && title.trim()) {
      const current = buildPendingKr();
      if (!current) {
        return;
      }

      staged.push(current);
    }

    if (staged.length === 0) {
      setError("Add at least one key result first.");
      return;
    }

    setIsSaving(true);
    setError("");
    const batch = beginOperationBatch("Saving key results", staged.length);

    try {
      for (let index = 0; index < staged.length; index += 1) {
        batch.setCurrentStep(index + 1);
        const item = staged[index];
        const response = await fetch(apiPath("/api/krs"), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-user-email": signedInEmail
          },
          body: JSON.stringify({
            objectiveKey,
            periodKey,
            title: item.title,
            owner: item.owner,
            ownerEmail: item.ownerEmail,
            metricType: item.metricType,
            baselineValue: item.baselineValue,
            targetValue: item.targetValue,
            currentValue: item.currentValue,
            status: item.status,
            dueDate: item.dueDate,
            checkInFrequency: item.checkInFrequency,
            blockers: item.blockers,
            notes: item.notes
          })
        });
        const payload = await readJson<ApiError>(response);

        if (!response.ok) {
          setError(payload?.error ?? `Failed to add key result at line ${index + 1}.`);
          setIsSaving(false);
          batch.finish();
          return;
        }
      }

      batch.finish();
      setIsSaving(false);
      setPendingKrs([]);
      closeAdd();
      setError("");
      router.refresh();
    } catch (error) {
      batch.finish();
      setError(error instanceof Error ? error.message : "Failed to save key results.");
      setIsSaving(false);
      return;
    }
  };

  return (
    <div className="kr-controls">
      {canCreate ? (
        <button
          className={`tab-btn tab-btn-add kr-add-btn ${isAdding ? "tab-btn-active" : ""}`}
          type="button"
          onClick={isAdding ? closeAdd : openAdd}
          disabled={isSaving}
        >
          Add Key Result
        </button>
      ) : null}

      {canCreate && isAdding ? (
        <form
          className="kr-form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveAllKrs();
          }}
        >
          <div className="kr-form-grid">
            <div className="field">
              <label>KR Code</label>
              <input name="krCode" value={krCodePreview} readOnly disabled={isSaving} />
            </div>
            <div className="field kr-field-wide">
              <label>Key Result</label>
              <textarea
                name="krTitle"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Key Result"
                autoFocus
                disabled={isSaving}
              />
            </div>
            <OwnerInput
              id={`kr-owner-${objectiveKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`}
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
              <input name="krOwnerEmail" value={ownerEmail} readOnly disabled={isSaving} />
            </div>
            <div className="field">
              <label>KR Metric Type</label>
              <select
                name="krMetricType"
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
            </div>
            <div className="field">
              <label>Baseline Value</label>
              <input
                name="krBaselineValue"
                type="number"
                step="any"
                value={baselineValue}
                onChange={(event) => setBaselineValue(event.target.value)}
                disabled={isSaving}
              />
            </div>
            <div className="field">
              <label>Target Value</label>
              <input
                name="krTargetValue"
                type="number"
                step="any"
                value={targetValue}
                onChange={(event) => setTargetValue(event.target.value)}
                disabled={isSaving}
              />
            </div>
            <div className="field">
              <label>Current Value</label>
              <input
                name="krCurrentValue"
                type="number"
                step="any"
                value={currentValue}
                onChange={(event) => setCurrentValue(event.target.value)}
                disabled={isSaving}
              />
            </div>
            <div className="field">
              <label>KR Status</label>
              <select name="krStatus" value={status} onChange={(event) => setStatus(event.target.value as KrStatus)} disabled={isSaving}>
                {keyResultStatusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Due Date</label>
              <input
                name="krDueDate"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                disabled={isSaving}
              />
            </div>
            <div className="field">
              <label>Check-in Frequency</label>
              <select
                name="krCheckInFrequency"
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
            </div>
            <div className="field kr-field-wide">
              <label>Blockers</label>
              <textarea name="krBlockers" value={blockers} onChange={(event) => setBlockers(event.target.value)} disabled={isSaving} />
            </div>
            <div className="field kr-field-wide">
              <label>Notes</label>
              <textarea name="krNotes" value={notes} onChange={(event) => setNotes(event.target.value)} disabled={isSaving} />
            </div>
          </div>
          <div className="actions">
            <button className="btn" type="button" onClick={queueKr} disabled={isSaving}>
              Add More
            </button>
            <button className="btn btn-add" type="submit" disabled={isSaving}>
              Save All{pendingKrs.length > 0 ? ` (${pendingKrs.length})` : ""}
            </button>
            <button className="tab-btn" type="button" onClick={closeAdd} disabled={isSaving}>
              Cancel
            </button>
          </div>
          {pendingKrs.length > 0 ? (
            <div className="field kr-field-wide">
              <label>Pending Key Results</label>
              <ul>
                {pendingKrs.map((item, index) => (
                  <li key={`${item.title}-${index}`}>
                    {item.title}{" "}
                    <button type="button" className="tab-btn" onClick={() => removeQueuedKr(index)} disabled={isSaving}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <p className="message">You have {pendingKrs.length} unsaved key result(s). Click Save All.</p>
            </div>
          ) : null}
        </form>
      ) : null}
      {error ? <p className="message danger">{error}</p> : null}
    </div>
  );
}
