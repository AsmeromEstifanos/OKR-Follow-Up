"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  selectedVentureKey?: string;
  departmentKey?: string;
  positionName: string;
  objectiveCount: number;
};

type ApiError = {
  error?: string;
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

export default function DashboardPositionRowControls({
  selectedVentureKey,
  departmentKey,
  positionName,
  objectiveCount
}: Props): JSX.Element {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [nameDraft, setNameDraft] = useState<string>(positionName);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    setNameDraft(positionName);
  }, [positionName]);

  const canManage = Boolean(selectedVentureKey && departmentKey);

  const closeEdit = (): void => {
    if (isSaving) {
      return;
    }

    setIsEditing(false);
    setNameDraft(positionName);
    setError("");
  };

  const savePosition = async (): Promise<void> => {
    if (isSaving) {
      return;
    }

    if (!selectedVentureKey || !departmentKey) {
      setError("Position cannot be edited right now.");
      return;
    }

    const name = nameDraft.trim();
    if (!name) {
      setError("Position name is required.");
      return;
    }

    if (name.toLowerCase() === positionName.toLowerCase()) {
      closeEdit();
      return;
    }

    setIsSaving(true);
    setError("");

    const response = await fetch(
      `/api/config/ventures/${encodeURIComponent(selectedVentureKey)}/departments/${encodeURIComponent(departmentKey)}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ name })
      }
    );

    if (!response.ok) {
      const payload = await readJson<ApiError>(response);
      setError(payload?.error ?? "Failed to update position.");
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    setIsEditing(false);
    router.refresh();
  };

  const deletePosition = async (): Promise<void> => {
    if (isSaving) {
      return;
    }

    if (!selectedVentureKey || !departmentKey) {
      setError("Position cannot be deleted right now.");
      return;
    }

    const warning =
      objectiveCount > 0
        ? `Delete position '${positionName}'? It currently has ${objectiveCount} objective(s). If objectives still exist in this position, deletion will fail.`
        : `Delete position '${positionName}'? This action cannot be undone.`;

    if (!window.confirm(warning)) {
      return;
    }

    setIsSaving(true);
    setError("");

    const response = await fetch(
      `/api/config/ventures/${encodeURIComponent(selectedVentureKey)}/departments/${encodeURIComponent(departmentKey)}`,
      {
        method: "DELETE"
      }
    );

    if (!response.ok) {
      const payload = await readJson<ApiError>(response);
      setError(payload?.error ?? "Failed to delete position.");
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    setIsEditing(false);
    router.refresh();
  };

  return (
    <div className="position-header-controls">
      <div className="position-title-wrap">
        {isEditing ? (
          <input
            className="objective-row-input position-title-input"
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            placeholder="Position"
            aria-label="Position name"
            autoFocus
            disabled={isSaving}
          />
        ) : (
          <h3 className="board-group-title">{positionName}</h3>
        )}
        {!isEditing && canManage ? (
          <button
            type="button"
            className="position-edit-trigger"
            aria-label={`Edit position ${positionName}`}
            title="Edit position"
            onClick={() => {
              setError("");
              setIsEditing(true);
            }}
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
      {isEditing ? (
        <div className="position-title-actions">
          <button className="btn" type="button" onClick={() => void savePosition()} disabled={isSaving}>
            Save
          </button>
          <button className="btn btn-danger" type="button" onClick={() => void deletePosition()} disabled={isSaving}>
            Delete
          </button>
          <button className="tab-btn" type="button" onClick={closeEdit} disabled={isSaving}>
            Cancel
          </button>
        </div>
      ) : null}
      {error ? <p className="message danger position-title-error">{error}</p> : null}
    </div>
  );
}
