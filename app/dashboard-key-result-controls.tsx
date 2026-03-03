"use client";

import type { CheckInFrequency, KrStatus, MetricType } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  objectiveKey: string;
  periodKey: string;
  defaultDueDate: string;
  defaultOwner: string;
};

type ApiError = {
  error?: string;
};

const METRIC_TYPE_OPTIONS: MetricType[] = ["Delivery", "Financial", "Operational", "People", "Quality"];
const KR_STATUS_OPTIONS: KrStatus[] = ["NotStarted", "OnTrack", "AtRisk", "OffTrack", "Done"];
const CHECKIN_FREQUENCY_OPTIONS: CheckInFrequency[] = ["Weekly", "BiWeekly", "Monthly", "AdHoc"];

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

export default function DashboardKeyResultControls({
  objectiveKey,
  periodKey,
  defaultDueDate,
  defaultOwner
}: Props): JSX.Element {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [krCode, setKrCode] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [owner, setOwner] = useState<string>(defaultOwner);
  const [metricType, setMetricType] = useState<MetricType>("Operational");
  const [baselineValue, setBaselineValue] = useState<string>("0");
  const [targetValue, setTargetValue] = useState<string>("100");
  const [currentValue, setCurrentValue] = useState<string>("0");
  const [status, setStatus] = useState<KrStatus>("NotStarted");
  const [dueDate, setDueDate] = useState<string>(toDateInput(defaultDueDate));
  const [checkInFrequency, setCheckInFrequency] = useState<CheckInFrequency>("Weekly");
  const [notes, setNotes] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [error, setError] = useState<string>("");

  const openAdd = (): void => {
    setError("");
    setIsAdding(true);
  };

  const closeAdd = (): void => {
    if (isSaving) {
      return;
    }

    setError("");
    setIsAdding(false);
    setKrCode("");
    setTitle("");
    setOwner(defaultOwner);
    setMetricType("Operational");
    setBaselineValue("0");
    setTargetValue("100");
    setCurrentValue("0");
    setStatus("NotStarted");
    setDueDate(toDateInput(defaultDueDate));
    setCheckInFrequency("Weekly");
    setNotes("");
    setLastUpdated("");
  };

  const createKr = async (): Promise<void> => {
    if (isSaving) {
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Key Result title is required.");
      return;
    }

    const baseline = Number(baselineValue);
    const target = Number(targetValue);
    const current = Number(currentValue);
    if (!Number.isFinite(baseline) || !Number.isFinite(target) || !Number.isFinite(current)) {
      setError("Baseline, target, and current values must be numbers.");
      return;
    }

    if (!dueDate) {
      setError("Due date is required.");
      return;
    }

    setIsSaving(true);
    setError("");

    const response = await fetch("/api/krs", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        krKey: krCode.trim() || undefined,
        objectiveKey,
        periodKey,
        title: trimmedTitle,
        owner: owner.trim() || defaultOwner,
        metricType,
        baselineValue: baseline,
        targetValue: target,
        currentValue: current,
        status,
        dueDate,
        checkInFrequency,
        notes: notes.trim(),
        lastCheckinAt: lastUpdated ? new Date(`${lastUpdated}T00:00:00.000Z`).toISOString() : null
      })
    });
    const payload = await readJson<ApiError>(response);

    if (!response.ok) {
      setError(payload?.error ?? "Failed to add key result.");
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    closeAdd();
    router.refresh();
  };

  return (
    <div className="kr-controls">
      <button
        className={`tab-btn kr-add-btn ${isAdding ? "tab-btn-active" : ""}`}
        type="button"
        onClick={isAdding ? closeAdd : openAdd}
        disabled={isSaving}
      >
        Add Key Result
      </button>

      {isAdding ? (
        <form
          className="kr-form"
          onSubmit={(event) => {
            event.preventDefault();
            void createKr();
          }}
        >
          <div className="kr-form-grid">
            <div className="field">
              <label>KR Code</label>
              <input
                value={krCode}
                onChange={(event) => setKrCode(event.target.value)}
                placeholder="KR-010"
                disabled={isSaving}
              />
            </div>
            <div className="field">
              <label>Key Result</label>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="KR title"
                autoFocus
                disabled={isSaving}
              />
            </div>
            <div className="field">
              <label>Owner</label>
              <input value={owner} onChange={(event) => setOwner(event.target.value)} disabled={isSaving} />
            </div>
            <div className="field">
              <label>KR Metric Type</label>
              <select value={metricType} onChange={(event) => setMetricType(event.target.value as MetricType)} disabled={isSaving}>
                {METRIC_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Baseline Value</label>
              <input
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
                type="number"
                step="any"
                value={currentValue}
                onChange={(event) => setCurrentValue(event.target.value)}
                disabled={isSaving}
              />
            </div>
            <div className="field">
              <label>KR Status</label>
              <select value={status} onChange={(event) => setStatus(event.target.value as KrStatus)} disabled={isSaving}>
                {KR_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Due Date</label>
              <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} disabled={isSaving} />
            </div>
            <div className="field">
              <label>Check-in Frequency</label>
              <select
                value={checkInFrequency}
                onChange={(event) => setCheckInFrequency(event.target.value as CheckInFrequency)}
                disabled={isSaving}
              >
                {CHECKIN_FREQUENCY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Last updated</label>
              <input
                type="date"
                value={lastUpdated}
                onChange={(event) => setLastUpdated(event.target.value)}
                disabled={isSaving}
              />
            </div>
            <div className="field kr-field-wide">
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
