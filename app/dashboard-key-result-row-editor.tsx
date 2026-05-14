"use client";

import ChatIconButton from "@/app/chat-icon-button";
import HighlightText from "@/app/highlight-text";
import OwnerInput from "@/app/owner-input";
import useCurrentUserEmail from "@/app/use-current-user-email";
import { apiPath } from "@/lib/base-path";
import { clampPercent, computeKrProgress } from "@/lib/okr-rules";
import { resolveOwnerEmail, resolveOwnerName } from "@/lib/owner";
import type { CheckInFrequency, KeyResult, KrStatus, MetricType, Milestone } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  keyResult: KeyResult;
  latestUpdateNotes?: string;
  latestUpdatedAt?: string | null;
  milestones: Milestone[];
  positionOwnerEmail?: string;
  adminEmails: string[];
  forcedExpanded?: boolean | null;
  forceToken?: number;
  highlightQuery?: string;
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

type MilestoneMode = "measurable" | "binary";

type MilestoneDraft = {
  title: string;
  weight: string;
  mode: MilestoneMode;
  isDone: boolean;
  targetValue: string;
  currentValue: string;
  progressPct: string;
};

type WeightDraftMap = Record<string, string>;

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

function ragFromProgress(progressPct: number): "Green" | "Amber" | "Red" {
  if (progressPct >= 70) {
    return "Green";
  }

  if (progressPct >= 40) {
    return "Amber";
  }

  return "Red";
}

function ragPillClass(rag: "Green" | "Amber" | "Red"): string {
  if (rag === "Green") {
    return "pill pill-green";
  }

  if (rag === "Amber") {
    return "pill pill-amber";
  }

  return "pill pill-red";
}

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString();
}

function normalizeEmail(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function parseOptionalNumberInput(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatOptionalMetricValue(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : String(value);
}

function inferMilestoneMode(targetValue: string, currentValue: string): MilestoneMode {
  return parseOptionalNumberInput(targetValue) !== null && parseOptionalNumberInput(currentValue) !== null
    ? "measurable"
    : "binary";
}

function getMilestoneProgressPreview(targetValue: string, currentValue: string, progressPct: string): string {
  const parsedTarget = parseOptionalNumberInput(targetValue);
  const parsedCurrent = parseOptionalNumberInput(currentValue);

  if (parsedTarget !== null && parsedCurrent !== null) {
    return String(computeKrProgress(0, parsedTarget, parsedCurrent));
  }

  return progressPct;
}

function milestoneDoneFromProgress(progressPct: string): boolean {
  const parsed = Number(progressPct);
  return Number.isFinite(parsed) && parsed >= 100;
}

function formatMilestoneProgressValue(milestone: Milestone): string {
  if (milestone.targetValue === null || milestone.targetValue === undefined) {
    return milestone.progressPct >= 100 ? "100%" : "0%";
  }

  return `${milestone.progressPct}%`;
}

function formatMilestoneCurrentValue(milestone: Milestone): string {
  if (milestone.targetValue === null || milestone.targetValue === undefined) {
    return milestone.progressPct >= 100 ? "Done" : "Not Done";
  }

  return formatOptionalMetricValue(milestone.currentValue);
}

function parseMilestonePayload(input: {
  title: string;
  weight: string;
  mode: MilestoneMode;
  isDone: boolean;
  targetValue: string;
  currentValue: string;
  progressPct: string;
}): { error?: string; payload?: { title: string; weight: number; targetValue: number | null; currentValue: number | null; progressPct: number } } {
  const weight = Number(input.weight);
  if (!input.title.trim() || !Number.isFinite(weight) || weight < 0) {
    return { error: "Milestone title and weight are required." };
  }

  let targetValue: number | null = null;
  let currentValue: number | null = null;
  let progressPct: number;

  if (input.mode === "measurable") {
    targetValue = parseOptionalNumberInput(input.targetValue);
    currentValue = parseOptionalNumberInput(input.currentValue);

    if (targetValue === null || currentValue === null) {
      return { error: "Target and current are required for measurable milestones." };
    }

    progressPct = computeKrProgress(0, targetValue, currentValue);
  } else {
    progressPct = input.isDone ? 100 : 0;
  }

  return {
    payload: {
      title: input.title.trim(),
      weight,
      targetValue,
      currentValue,
      progressPct: clampPercent(progressPct)
    }
  };
}

function sumWeightDrafts(weightDrafts: WeightDraftMap): number {
  return Object.values(weightDrafts).reduce((sum, value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? sum + parsed : sum;
  }, 0);
}

export default function DashboardKeyResultRowEditor({
  keyResult,
  latestUpdateNotes,
  latestUpdatedAt,
  milestones,
  positionOwnerEmail,
  adminEmails,
  forcedExpanded,
  forceToken,
  highlightQuery = "",
  keyResultStatusOptions,
}: Props): JSX.Element {
  const router = useRouter();
  const signedInEmail = useCurrentUserEmail();
  const krCode = keyResult.krCode ?? keyResult.krKey;

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isMilestoneSaving, setIsMilestoneSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [isMilestonesOpen, setIsMilestonesOpen] = useState<boolean>(false);

  const [code, setCode] = useState<string>(krCode);
  const [title, setTitle] = useState<string>(keyResult.title);
  const [owner, setOwner] = useState<string>(resolveOwnerName(keyResult.owner));
  const [ownerEmail, setOwnerEmail] = useState<string>(resolveOwnerEmail(keyResult.owner, keyResult.ownerEmail));
  const [measurementRule, setMeasurementRule] = useState<string>(keyResult.measurementRule ?? "");
  const [targetValue, setTargetValue] = useState<string>(String(keyResult.targetValue));
  const [currentValue, setCurrentValue] = useState<string>(String(keyResult.currentValue));
  const [status, setStatus] = useState<KrStatus>(keyResult.status);
  const [dueDate, setDueDate] = useState<string>(keyResult.dueDate?.slice(0, 10) ?? "");
  const [blockers, setBlockers] = useState<string>(keyResult.blockers ?? "");
  const [supportNeeded, setSupportNeeded] = useState<string>(keyResult.supportNeeded ?? "");
  const [notes, setNotes] = useState<string>(keyResult.notes || latestUpdateNotes || "");
  const [milestoneTitle, setMilestoneTitle] = useState<string>("");
  const [milestoneWeight, setMilestoneWeight] = useState<string>("0.25");
  const [milestoneMode, setMilestoneMode] = useState<MilestoneMode>("binary");
  const [milestoneIsDone, setMilestoneIsDone] = useState<boolean>(false);
  const [milestoneTargetValue, setMilestoneTargetValue] = useState<string>("");
  const [milestoneCurrentValue, setMilestoneCurrentValue] = useState<string>("");
  const [milestoneProgressPct, setMilestoneProgressPct] = useState<string>("0");
  const [isAddingMilestone, setIsAddingMilestone] = useState<boolean>(false);
  const [editingMilestoneKey, setEditingMilestoneKey] = useState<string>("");
  const [milestoneDraft, setMilestoneDraft] = useState<MilestoneDraft | null>(null);
  const [isEditingWeights, setIsEditingWeights] = useState<boolean>(false);
  const [weightDrafts, setWeightDrafts] = useState<WeightDraftMap>({});
  const normalizedOwnerEmail = normalizeEmail(resolveOwnerEmail(keyResult.owner, keyResult.ownerEmail));
  const normalizedPositionOwnerEmail = normalizeEmail(positionOwnerEmail);
  const normalizedUserEmail = normalizeEmail(signedInEmail);
  const isAdmin = adminEmails.map((entry) => normalizeEmail(entry)).includes(normalizedUserEmail);
  const canEdit =
    Boolean(normalizedUserEmail) &&
    (isAdmin || normalizedOwnerEmail === normalizedUserEmail || normalizedPositionOwnerEmail === normalizedUserEmail);
  const krRag = ragFromProgress(keyResult.progressPct);
  const hasMilestoneBackedProgress = milestones.length > 0;

  useEffect(() => {
    setCode(krCode);
    setTitle(keyResult.title);
    setOwner(resolveOwnerName(keyResult.owner));
    setOwnerEmail(resolveOwnerEmail(keyResult.owner, keyResult.ownerEmail));
    setMeasurementRule(keyResult.measurementRule ?? "");
    setTargetValue(String(keyResult.targetValue));
    setCurrentValue(String(keyResult.currentValue));
    setStatus(keyResult.status);
    setDueDate(keyResult.dueDate?.slice(0, 10) ?? "");
    setBlockers(keyResult.blockers ?? "");
    setSupportNeeded(keyResult.supportNeeded ?? "");
    setNotes(keyResult.notes || latestUpdateNotes || "");
  }, [keyResult, krCode, latestUpdateNotes]);

  useEffect(() => {
    if (forcedExpanded === null || forcedExpanded === undefined) {
      return;
    }

    setIsMilestonesOpen(forcedExpanded);
  }, [forcedExpanded, forceToken]);

  const saveEdit = async (): Promise<void> => {
    if (isSaving) {
      return;
    }

    if (!title.trim()) {
      setError("KR title is required.");
      return;
    }

    const target = Number(targetValue);
    const current = Number(currentValue);
    if (!hasMilestoneBackedProgress && (!Number.isFinite(target) || !Number.isFinite(current))) {
      setError("Target and current must be numbers.");
      return;
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
        krCode: code.trim(),
        title: title.trim(),
        owner: owner.trim(),
        ownerEmail: ownerEmail.trim(),
        measurementRule: measurementRule.trim(),
        ...(!hasMilestoneBackedProgress ? { targetValue: target, currentValue: current } : {}),
        status,
        dueDate,
        blockers: blockers.trim(),
        supportNeeded: supportNeeded.trim(),
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

    if (!window.confirm(`Delete key result '${keyResult.title}'? Related check-ins will also be deleted.`)) {
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

  const createMilestone = async (): Promise<void> => {
    const parsed = parseMilestonePayload({
      title: milestoneTitle,
      weight: milestoneWeight,
      mode: milestoneMode,
      isDone: milestoneIsDone,
      targetValue: milestoneTargetValue,
      currentValue: milestoneCurrentValue,
      progressPct: milestoneProgressPct
    });
    if (!parsed.payload) {
      setError(parsed.error ?? "Invalid milestone values.");
      return;
    }

    setIsMilestoneSaving(true);
    setError("");
    const response = await fetch(apiPath("/api/milestones"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        krKey: keyResult.krKey,
        ...parsed.payload
      })
    });

    if (!response.ok) {
      const payload = await readJson<ApiError>(response);
      setError(payload?.error ?? "Failed to create milestone.");
      setIsMilestoneSaving(false);
      return;
    }

    setMilestoneTitle("");
    setMilestoneWeight("0.25");
    setMilestoneMode("binary");
    setMilestoneIsDone(false);
    setMilestoneTargetValue("");
    setMilestoneCurrentValue("");
    setMilestoneProgressPct("0");
    setIsMilestoneSaving(false);
    setIsAddingMilestone(false);
    setIsMilestonesOpen(true);
    router.refresh();
  };

  const startEditingMilestone = (milestone: Milestone): void => {
    const targetValue = milestone.targetValue === null || milestone.targetValue === undefined ? "" : String(milestone.targetValue);
    const currentValue = milestone.currentValue === null || milestone.currentValue === undefined ? "" : String(milestone.currentValue);
    setEditingMilestoneKey(milestone.milestoneKey);
    setMilestoneDraft({
      title: milestone.title,
      weight: String(milestone.weight),
      mode: inferMilestoneMode(targetValue, currentValue),
      isDone: milestone.progressPct >= 100,
      targetValue,
      currentValue,
      progressPct: String(milestone.progressPct)
    });
    setError("");
  };

  const startEditingWeights = (): void => {
    setWeightDrafts(
      Object.fromEntries(milestones.map((milestone) => [milestone.milestoneKey, String(milestone.weight)]))
    );
    setIsEditingWeights(true);
    setError("");
  };

  const cancelEditingWeights = (): void => {
    setIsEditingWeights(false);
    setWeightDrafts({});
    setError("");
  };

  const cancelEditingMilestone = (): void => {
    setEditingMilestoneKey("");
    setMilestoneDraft(null);
    setError("");
  };

  const saveMilestoneEdit = async (milestoneKey: string): Promise<void> => {
    if (!milestoneDraft || isMilestoneSaving) {
      return;
    }

    const parsed = parseMilestonePayload(milestoneDraft);
    if (!parsed.payload) {
      setError(parsed.error ?? "Invalid milestone values.");
      return;
    }

    setIsMilestoneSaving(true);
    const response = await fetch(apiPath(`/api/milestones/${encodeURIComponent(milestoneKey)}`), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.payload)
    });

    if (!response.ok) {
      const payload = await readJson<ApiError>(response);
      setError(payload?.error ?? "Failed to update milestone.");
      setIsMilestoneSaving(false);
      return;
    }

    setIsMilestoneSaving(false);
    cancelEditingMilestone();
    router.refresh();
  };

  const deleteMilestoneItem = async (milestoneKey: string): Promise<void> => {
    if (isMilestoneSaving) {
      return;
    }

    setIsMilestoneSaving(true);
    const response = await fetch(apiPath(`/api/milestones/${encodeURIComponent(milestoneKey)}`), {
      method: "DELETE"
    });

    if (!response.ok) {
      const payload = await readJson<ApiError>(response);
      setError(payload?.error ?? "Failed to delete milestone.");
      setIsMilestoneSaving(false);
      return;
    }

    setIsMilestoneSaving(false);
    cancelEditingMilestone();
    router.refresh();
  };

  const saveWeightEdits = async (): Promise<void> => {
    if (isMilestoneSaving) {
      return;
    }

    const entries = milestones.map((milestone) => {
      const rawValue = weightDrafts[milestone.milestoneKey] ?? String(milestone.weight);
      const parsed = Number(rawValue);
      return {
        milestoneKey: milestone.milestoneKey,
        rawValue,
        parsed
      };
    });

    if (entries.some((entry) => !Number.isFinite(entry.parsed) || entry.parsed < 0)) {
      setError("All milestone weights must be valid numbers.");
      return;
    }

    const total = entries.reduce((sum, entry) => sum + entry.parsed, 0);
    if (Math.abs(total - 1) > 0.0001) {
      setError(`Milestone weights must add up to 1. Current total: ${total.toFixed(2)}.`);
      return;
    }

    setIsMilestoneSaving(true);
    setError("");

    const responses = await Promise.all(
      entries.map((entry) =>
        fetch(apiPath(`/api/milestones/${encodeURIComponent(entry.milestoneKey)}`), {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ weight: entry.parsed })
        })
      )
    );

    const failedResponse = responses.find((response) => !response.ok);
    if (failedResponse) {
      const payload = await readJson<ApiError>(failedResponse);
      setError(payload?.error ?? "Failed to update milestone weights.");
      setIsMilestoneSaving(false);
      return;
    }

    setIsMilestoneSaving(false);
    cancelEditingWeights();
    router.refresh();
  };

  return (
    <>
      <tr className={`board-kr-row ${isEditing ? "board-kr-row-editing" : ""}`}>
        <td className="board-subitem-cell">
          <div className="objective-title-wrap">
            {isEditing ? (
              <input className="objective-row-input" value={title} onChange={(event) => setTitle(event.target.value)} autoFocus disabled={isSaving} />
            ) : (
              <span className="objective-title-text">
                <HighlightText text={keyResult.title} query={highlightQuery} />
              </span>
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
          <button
            type="button"
            className={`objective-kr-toggle board-kr-milestone-link ${isMilestonesOpen ? "is-open" : ""}`}
            onClick={() => setIsMilestonesOpen((current) => !current)}
          >
            {milestones.length > 0 ? `Milestones (${milestones.length})` : "Add Milestone"}
          </button>
          {isEditing ? <input className="objective-row-input" value={code} onChange={(event) => setCode(event.target.value)} disabled={isSaving} /> : null}
          {isEditing ? (
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
              placeholder="Owner"
            />
          ) : null}
          {canEdit && isEditing ? (
            <div className="objective-row-actions">
              <button className="btn" type="button" onClick={() => void saveEdit()} disabled={isSaving}>
                Save
              </button>
              <button className="btn btn-danger" type="button" onClick={() => void deleteCurrentKeyResult()} disabled={isSaving}>
                Delete
              </button>
              <button className="tab-btn" type="button" onClick={() => setIsEditing(false)} disabled={isSaving}>
                Cancel
              </button>
            </div>
          ) : null}
          {error ? <p className="message danger objective-row-error">{error}</p> : null}
        </td>
        <td className="chat-col-cell">
          <ChatIconButton
            entityType="kr"
            entityKey={keyResult.krKey}
            entityLabel={keyResult.title}
          />
        </td>
        <td>
          {isEditing ? (
            <textarea className="objective-row-input" value={measurementRule} onChange={(event) => setMeasurementRule(event.target.value)} disabled={isSaving} />
          ) : keyResult.measurementRule ? (
            <HighlightText text={keyResult.measurementRule} query={highlightQuery} />
          ) : (
            "-"
          )}
        </td>
        <td>
          {hasMilestoneBackedProgress ? "-" : isEditing ? (
            <input className="objective-row-input" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} disabled={isSaving} />
          ) : (
            keyResult.targetValue
          )}
        </td>
        <td>
          {hasMilestoneBackedProgress ? "-" : isEditing ? (
            <input className="objective-row-input" value={currentValue} onChange={(event) => setCurrentValue(event.target.value)} disabled={isSaving} />
          ) : (
            keyResult.currentValue
          )}
        </td>
        <td>{keyResult.progressPct}%</td>
        <td>{isEditing ? <input className="objective-row-input" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} disabled={isSaving} /> : formatDate(keyResult.dueDate)}</td>
        <td>{isEditing ? <input className="objective-row-input" value={notes} onChange={(event) => setNotes(event.target.value)} disabled={isSaving} /> : keyResult.notes || latestUpdateNotes || "-"}</td>
        <td>{isEditing ? <input className="objective-row-input" value={blockers} onChange={(event) => setBlockers(event.target.value)} disabled={isSaving} /> : keyResult.blockers || "-"}</td>
        <td>{isEditing ? <input className="objective-row-input" value={supportNeeded} onChange={(event) => setSupportNeeded(event.target.value)} disabled={isSaving} /> : keyResult.supportNeeded || "-"}</td>
        <td>
          {isEditing ? (
            <select className="objective-row-select" value={status} onChange={(event) => setStatus(event.target.value as KrStatus)} disabled={isSaving}>
              {keyResultStatusOptions.map((option) => (
                <option key={option} value={option}>
                  {formatStatus(option)}
                </option>
              ))}
            </select>
          ) : (
            <span className={ragPillClass(krRag)}>{krRag}</span>
          )}
        </td>
      </tr>
      {isMilestonesOpen ? (
        <tr className="board-details-row">
          <td colSpan={11}>
            <div className="board-milestones-panel">
              <table className="board-milestone-table">
                <thead>
                  <tr>
                    <th>KPI / Milestone</th>
                    <th>Weight</th>
                    <th>Target</th>
                    <th>Current</th>
                    <th>KR Progress %</th>
                  </tr>
                </thead>
                <tbody>
                  {milestones.length === 0 ? (
                    <tr className="board-empty-row">
                      <td colSpan={5}>No milestones for this KR yet.</td>
                    </tr>
                  ) : (
                    milestones.map((milestone) => (
                      <tr key={milestone.milestoneKey} className="okr-kpi-row">
                        <td className="board-subitem-cell">
                          <div className="objective-title-wrap">
                            {editingMilestoneKey === milestone.milestoneKey && milestoneDraft ? (
                              <input
                                className="objective-row-input"
                                value={milestoneDraft.title}
                                onChange={(event) =>
                                  setMilestoneDraft((current) => (current ? { ...current, title: event.target.value } : current))
                                }
                                disabled={isMilestoneSaving}
                              />
                            ) : (
                              <span className="objective-title-text">{milestone.title}</span>
                            )}
                            {!editingMilestoneKey && canEdit ? (
                              <button
                                type="button"
                                className="objective-edit-trigger"
                                aria-label={`Edit ${milestone.title}`}
                                title="Edit milestone"
                                onClick={() => startEditingMilestone(milestone)}
                                disabled={isMilestoneSaving}
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
                          {editingMilestoneKey === milestone.milestoneKey && milestoneDraft ? (
                            <select
                              className="objective-row-select"
                              value={milestoneDraft.mode}
                              onChange={(event) =>
                                setMilestoneDraft((current) => {
                                  if (!current) {
                                    return current;
                                  }

                                  const nextMode = event.target.value as MilestoneMode;
                                  return nextMode === "binary"
                                    ? { ...current, mode: nextMode, isDone: current.isDone, targetValue: "", currentValue: "", progressPct: current.isDone ? "100" : "0" }
                                    : { ...current, mode: nextMode };
                                })
                              }
                              disabled={isMilestoneSaving}
                            >
                              <option value="binary">Non-measurable</option>
                              <option value="measurable">Measurable</option>
                            </select>
                          ) : null}
                          {editingMilestoneKey === milestone.milestoneKey ? (
                            <div className="objective-row-actions">
                              <button className="btn" type="button" onClick={() => void saveMilestoneEdit(milestone.milestoneKey)} disabled={isMilestoneSaving}>
                                Save
                              </button>
                              <button className="btn btn-danger" type="button" onClick={() => void deleteMilestoneItem(milestone.milestoneKey)} disabled={isMilestoneSaving}>
                                Delete
                              </button>
                              <button className="tab-btn" type="button" onClick={cancelEditingMilestone} disabled={isMilestoneSaving}>
                                Cancel
                              </button>
                            </div>
                          ) : null}
                        </td>
                        <td>
                          {editingMilestoneKey === milestone.milestoneKey && milestoneDraft ? (
                            <input
                              className="objective-row-input"
                              type="number"
                              step="0.01"
                              value={milestoneDraft.weight}
                              onChange={(event) =>
                                setMilestoneDraft((current) => (current ? { ...current, weight: event.target.value } : current))
                              }
                              disabled={isMilestoneSaving}
                            />
                          ) : (
                            milestone.weight
                          )}
                        </td>
                        <td>
                          {editingMilestoneKey === milestone.milestoneKey && milestoneDraft ? (
                            <input
                              className="objective-row-input"
                              type="number"
                              value={milestoneDraft.targetValue}
                              onChange={(event) =>
                                setMilestoneDraft((current) =>
                                  current ? { ...current, targetValue: event.target.value } : current
                                )
                              }
                              disabled={isMilestoneSaving || milestoneDraft.mode === "binary"}
                            />
                          ) : (
                            formatOptionalMetricValue(milestone.targetValue)
                          )}
                        </td>
                        <td>
                          {editingMilestoneKey === milestone.milestoneKey && milestoneDraft ? (
                            <input
                              className="objective-row-input"
                              type="number"
                              value={milestoneDraft.currentValue}
                              onChange={(event) =>
                                setMilestoneDraft((current) =>
                                  current ? { ...current, currentValue: event.target.value } : current
                                )
                              }
                              disabled={isMilestoneSaving || milestoneDraft.mode === "binary"}
                            />
                          ) : (
                            formatMilestoneCurrentValue(milestone)
                          )}
                        </td>
                        <td>
                          {editingMilestoneKey === milestone.milestoneKey && milestoneDraft ? milestoneDraft.mode === "measurable" ? (
                            <input
                              className="objective-row-input"
                              type="number"
                              step="0.01"
                              value={getMilestoneProgressPreview(
                                milestoneDraft.targetValue,
                                milestoneDraft.currentValue,
                                milestoneDraft.progressPct
                              )}
                              readOnly
                              disabled={isMilestoneSaving}
                            />
                          ) : (
                            <div className="objective-row-actions">
                              <button
                                className={milestoneDraft.isDone ? "btn" : "tab-btn"}
                                type="button"
                                onClick={() =>
                                  setMilestoneDraft((current) => (current ? { ...current, isDone: true, progressPct: "100" } : current))
                                }
                                disabled={isMilestoneSaving}
                              >
                                Done
                              </button>
                              <button
                                className={!milestoneDraft.isDone ? "btn" : "tab-btn"}
                                type="button"
                                onClick={() =>
                                  setMilestoneDraft((current) => (current ? { ...current, isDone: false, progressPct: "0" } : current))
                                }
                                disabled={isMilestoneSaving}
                              >
                                Not Done
                              </button>
                            </div>
                          ) : (
                            formatMilestoneProgressValue(milestone)
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {canEdit && milestones.length > 0 ? (
                isEditingWeights ? (
                  <div className="board-milestones-panel">
                    <table className="board-milestone-table">
                      <thead>
                        <tr>
                          <th>KPI / Milestone</th>
                          <th>Weight</th>
                        </tr>
                      </thead>
                      <tbody>
                        {milestones.map((milestone) => (
                          <tr key={`weight-edit-${milestone.milestoneKey}`} className="okr-kpi-row">
                            <td className="board-subitem-cell">
                              <span className="objective-title-text">{milestone.title}</span>
                            </td>
                            <td>
                              <input
                                className="objective-row-input"
                                value={weightDrafts[milestone.milestoneKey] ?? String(milestone.weight)}
                                onChange={(event) =>
                                  setWeightDrafts((current) => ({
                                    ...current,
                                    [milestone.milestoneKey]: event.target.value
                                  }))
                                }
                                type="number"
                                step="0.01"
                                disabled={isMilestoneSaving}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="board-meta">Total weight: {sumWeightDrafts(weightDrafts).toFixed(2)} / 1.00</div>
                    <div className="board-milestone-actions">
                      <button className="btn" type="button" onClick={() => void saveWeightEdits()} disabled={isMilestoneSaving}>
                        Save Weights
                      </button>
                      <button className="tab-btn" type="button" onClick={cancelEditingWeights} disabled={isMilestoneSaving}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="board-milestone-add-row">
                    <button
                      className="objective-kr-toggle board-kr-milestone-link"
                      type="button"
                      onClick={startEditingWeights}
                      disabled={isMilestoneSaving}
                    >
                      Set Weights
                    </button>
                  </div>
                )
              ) : null}
              {canEdit ? (
                milestones.length > 0 && !isAddingMilestone ? (
                  <div className="board-milestone-add-row">
                    <button
                      className="objective-kr-toggle board-kr-milestone-link"
                      type="button"
                      onClick={() => setIsAddingMilestone(true)}
                      disabled={isMilestoneSaving}
                    >
                      Add Milestone
                    </button>
                  </div>
                ) : (
                  <div className="board-milestone-create">
                    <input value={milestoneTitle} onChange={(event) => setMilestoneTitle(event.target.value)} placeholder="KPI / Milestone" />
                    <input value={milestoneWeight} onChange={(event) => setMilestoneWeight(event.target.value)} placeholder="Weight" type="number" step="0.01" />
                    <select
                      className="objective-row-select"
                      value={milestoneMode}
                      onChange={(event) => {
                        const nextMode = event.target.value as MilestoneMode;
                        setMilestoneMode(nextMode);
                        if (nextMode === "binary") {
                          setMilestoneTargetValue("");
                          setMilestoneCurrentValue("");
                          setMilestoneProgressPct(milestoneIsDone ? "100" : "0");
                        }
                      }}
                    >
                      <option value="binary">Non-measurable</option>
                      <option value="measurable">Measurable</option>
                    </select>
                    {milestoneMode === "measurable" ? (
                      <>
                        <input
                          value={milestoneTargetValue}
                          onChange={(event) => setMilestoneTargetValue(event.target.value)}
                          placeholder="Target"
                          type="number"
                        />
                        <input
                          value={milestoneCurrentValue}
                          onChange={(event) => setMilestoneCurrentValue(event.target.value)}
                          placeholder="Current"
                          type="number"
                        />
                        <input
                          value={getMilestoneProgressPreview(milestoneTargetValue, milestoneCurrentValue, milestoneProgressPct)}
                          placeholder="KR Progress %"
                          type="number"
                          step="0.01"
                          readOnly
                          disabled={isMilestoneSaving}
                        />
                      </>
                    ) : (
                      <div className="objective-row-actions">
                        <button
                          className={milestoneIsDone ? "btn" : "tab-btn"}
                          type="button"
                          onClick={() => {
                            setMilestoneIsDone(true);
                            setMilestoneProgressPct("100");
                          }}
                          disabled={isMilestoneSaving}
                        >
                          Done
                        </button>
                        <button
                          className={!milestoneIsDone ? "btn" : "tab-btn"}
                          type="button"
                          onClick={() => {
                            setMilestoneIsDone(false);
                            setMilestoneProgressPct("0");
                          }}
                          disabled={isMilestoneSaving}
                        >
                          Not Done
                        </button>
                      </div>
                    )}
                    <div className="board-milestone-actions">
                      <button className="btn" type="button" onClick={() => void createMilestone()} disabled={isMilestoneSaving}>
                        Add
                      </button>
                      {milestones.length > 0 ? (
                        <button
                          className="tab-btn"
                          type="button"
                          onClick={() => {
                            setIsAddingMilestone(false);
                            setMilestoneTitle("");
                            setMilestoneWeight("0.25");
                            setMilestoneMode("binary");
                            setMilestoneIsDone(false);
                            setMilestoneTargetValue("");
                            setMilestoneCurrentValue("");
                            setMilestoneProgressPct("0");
                          }}
                          disabled={isMilestoneSaving}
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </div>
                )
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
