"use client";

import OwnerInput from "@/app/owner-input";
import { apiPath } from "@/lib/base-path";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useCurrentUserEmail from "./use-current-user-email";

type Props = {
  selectedVentureKey?: string;
  existingPositionNames: string[];
  adminEmails: string[];
};

type ApiError = {
  error?: string;
};

type OwnerSuggestion = {
  displayName: string;
  principalName: string;
  mail: string;
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

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export default function DashboardPositionControls({
  selectedVentureKey,
  existingPositionNames,
  adminEmails
}: Props): JSX.Element {
  const router = useRouter();
  const currentUserEmail = useCurrentUserEmail();
  const isAdmin = adminEmails.map((entry) => normalizeEmail(entry)).includes(normalizeEmail(currentUserEmail));
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [positionName, setPositionName] = useState<string>("");
  const [positionOwner, setPositionOwner] = useState<string>("");
  const [positionOwnerEmail, setPositionOwnerEmail] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const openAdd = (): void => {
    setError("");
    setPositionName("");
    setPositionOwner("");
    setPositionOwnerEmail("");
    setIsAdding(true);
  };

  const closeAdd = (): void => {
    if (isSaving) {
      return;
    }

    setError("");
    setPositionName("");
    setPositionOwner("");
    setPositionOwnerEmail("");
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

    const response = await fetch(apiPath(`/api/config/ventures/${encodeURIComponent(selectedVentureKey)}/departments`), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-email": currentUserEmail
      },
      body: JSON.stringify({
        name,
        owner: positionOwner.trim(),
        ownerEmail: positionOwnerEmail.trim()
      })
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
    setPositionOwner("");
    setPositionOwnerEmail("");
    router.refresh();
  };

  return (
    <div className="position-controls">
      {isAdmin ? (
        <button
          className={`tab-btn tab-btn-add ${isAdding ? "tab-btn-active" : ""}`}
          type="button"
          onClick={isAdding ? closeAdd : openAdd}
          disabled={isSaving}
        >
          Add Position
        </button>
      ) : null}
      {isAdmin && isAdding ? (
        <form
          className="position-form"
          onSubmit={(event) => {
            event.preventDefault();
            void createPosition();
          }}
        >
          <input
            name="positionName"
            value={positionName}
            onChange={(event) => setPositionName(event.target.value)}
            placeholder="Position name"
            aria-label="Position name"
            autoFocus
            disabled={isSaving}
          />
          <OwnerInput
            id={`position-owner-${selectedVentureKey ?? "default"}`}
            value={positionOwner}
            onChange={setPositionOwner}
            onSelectUser={(user: OwnerSuggestion | null) => {
              setPositionOwnerEmail(user ? user.mail || user.principalName : "");
            }}
            showLabel={false}
            placeholder="Position owner (optional)"
            disabled={isSaving}
            inputClassName="objective-row-input"
          />
          <input
            name="positionOwnerEmail"
            value={positionOwnerEmail}
            onChange={(event) => setPositionOwnerEmail(event.target.value)}
            placeholder="Owner email (optional)"
            aria-label="Position owner email"
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
