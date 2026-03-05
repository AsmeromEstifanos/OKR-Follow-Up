"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  selectedVentureKey?: string;
  existingPositionNames: string[];
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

export default function DashboardPositionControls({ selectedVentureKey, existingPositionNames }: Props): JSX.Element {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [positionName, setPositionName] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const openAdd = (): void => {
    setError("");
    setPositionName("");
    setIsAdding(true);
  };

  const closeAdd = (): void => {
    if (isSaving) {
      return;
    }

    setError("");
    setPositionName("");
    setIsAdding(false);
  };

  const createPosition = async (): Promise<void> => {
    if (isSaving) {
      return;
    }

    if (!selectedVentureKey) {
      setError("Select a venture first.");
      return;
    }

    const name = positionName.trim();
    if (!name) {
      setError("Position name is required.");
      return;
    }

    const duplicate = existingPositionNames.some((existingName) => existingName.toLowerCase() === name.toLowerCase());
    if (duplicate) {
      setError(`Position '${name}' already exists.`);
      return;
    }

    setIsSaving(true);
    setError("");

    const response = await fetch(`/api/config/ventures/${encodeURIComponent(selectedVentureKey)}/departments`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ name })
    });
    const payload = await readJson<ApiError>(response);

    if (!response.ok) {
      setError(payload?.error ?? "Failed to add position.");
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    setIsAdding(false);
    setPositionName("");
    router.refresh();
  };

  return (
    <div className="position-controls">
      <button
        className={`tab-btn tab-btn-add ${isAdding ? "tab-btn-active" : ""}`}
        type="button"
        onClick={isAdding ? closeAdd : openAdd}
        disabled={isSaving}
      >
        Add Position
      </button>
      {isAdding ? (
        <form
          className="position-form"
          onSubmit={(event) => {
            event.preventDefault();
            void createPosition();
          }}
        >
          <input
            value={positionName}
            onChange={(event) => setPositionName(event.target.value)}
            placeholder="Position name"
            aria-label="Position name"
            autoFocus
            disabled={isSaving}
          />
          <button className="btn btn-add" type="submit" disabled={isSaving}>
            Add
          </button>
          <button className="tab-btn" type="button" onClick={closeAdd} disabled={isSaving}>
            Cancel
          </button>
        </form>
      ) : null}
      {error ? <p className="message danger">{error}</p> : null}
    </div>
  );
}
