"use client";

import { apiPath } from "@/lib/base-path";
import type { Venture } from "@/lib/types";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
import useCurrentUserEmail from "./use-current-user-email";

type Props = {
  ventures: Venture[];
  selectedVentureKey?: string;
  adminEmails: string[];
};

type ApiError = {
  error?: string;
};

function buildTabHref(pathname: string, searchParams: URLSearchParams, ventureKey: string): string {
  const params = new URLSearchParams(searchParams.toString());
  params.set("ventureKey", ventureKey);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
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

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export default function DashboardVentureTabs({ ventures, selectedVentureKey, adminEmails }: Props): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentUserEmail = useCurrentUserEmail();
  const isAdmin = adminEmails.map((entry) => normalizeEmail(entry)).includes(normalizeEmail(currentUserEmail));

  const [ventureName, setVentureName] = useState<string>("");
  const [isAddingVenture, setIsAddingVenture] = useState<boolean>(false);
  const [isSavingVenture, setIsSavingVenture] = useState<boolean>(false);
  const [editingVentureKey, setEditingVentureKey] = useState<string>("");
  const [editingVentureNameDraft, setEditingVentureNameDraft] = useState<string>("");
  const [isSavingSelectedVenture, setIsSavingSelectedVenture] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const fallbackVenture = ventures[0];
  const activeVentureKey = useMemo(() => {
    if (selectedVentureKey && ventures.some((venture) => venture.ventureKey.toLowerCase() === selectedVentureKey.toLowerCase())) {
      return selectedVentureKey;
    }

    return fallbackVenture?.ventureKey ?? "";
  }, [fallbackVenture?.ventureKey, selectedVentureKey, ventures]);

  const editingVenture = ventures.find((venture) => venture.ventureKey.toLowerCase() === editingVentureKey.toLowerCase());
  const isEditingVentureActive = Boolean(
    editingVenture && activeVentureKey.toLowerCase() === editingVenture.ventureKey.toLowerCase()
  );

  const openAddVenture = (): void => {
    setError("");
    setVentureName("");
    setIsAddingVenture(true);
  };

  const closeAddVenture = (): void => {
    setError("");
    setVentureName("");
    setIsAddingVenture(false);
  };

  const openEditVenture = (venture: Venture): void => {
    setError("");
    setEditingVentureKey(venture.ventureKey);
    setEditingVentureNameDraft(venture.name);
  };

  const closeEditVenture = (): void => {
    setError("");
    setEditingVentureKey("");
    setEditingVentureNameDraft("");
  };

  const createVenture = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const name = ventureName.trim();

    if (!name) {
      setError("Venture name is required.");
      return;
    }

    setIsSavingVenture(true);
    setError("");

    const response = await fetch(apiPath("/api/config/ventures"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-email": currentUserEmail
      },
      body: JSON.stringify({ name })
    });
    const payload = await readJson<Venture & ApiError>(response);

    if (!response.ok) {
      setError(payload?.error ?? "Failed to add venture.");
      setIsSavingVenture(false);
      return;
    }

    closeAddVenture();
    setIsSavingVenture(false);

    const targetVentureKey = payload?.ventureKey ?? activeVentureKey;
    if (targetVentureKey) {
      router.push(buildTabHref(pathname, searchParams, targetVentureKey));
    }
    router.refresh();
  };

  const saveEditedVenture = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const targetVentureKey = editingVentureKey.trim();
    if (!targetVentureKey) {
      setError("Select a venture first.");
      return;
    }

    const name = editingVentureNameDraft.trim();
    if (!name) {
      setError("Venture name is required.");
      return;
    }

    setIsSavingSelectedVenture(true);
    setError("");

    const response = await fetch(apiPath(`/api/config/ventures/${encodeURIComponent(targetVentureKey)}`), {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-user-email": currentUserEmail
      },
      body: JSON.stringify({ name })
    });
    const payload = await readJson<ApiError>(response);

    if (!response.ok) {
      setError(payload?.error ?? "Failed to update venture.");
      setIsSavingSelectedVenture(false);
      return;
    }

    setIsSavingSelectedVenture(false);
    closeEditVenture();
    router.refresh();
  };

  const deleteVentureByKey = async (venture: Venture, isActiveTab: boolean): Promise<void> => {
    const shouldDelete = window.confirm(
      `Delete venture '${venture.name}'? This will also delete related positions, objectives, key results, and check-ins.`
    );
    if (!shouldDelete) {
      return;
    }

    setIsSavingSelectedVenture(true);
    setError("");

    const response = await fetch(apiPath(`/api/config/ventures/${encodeURIComponent(venture.ventureKey)}`), {
      method: "DELETE",
      headers: {
        "x-user-email": currentUserEmail
      }
    });
    const payload = await readJson<ApiError>(response);

    if (!response.ok) {
      setError(payload?.error ?? "Failed to delete venture.");
      setIsSavingSelectedVenture(false);
      return;
    }

    setIsSavingSelectedVenture(false);
    closeEditVenture();

    if (isActiveTab) {
      const remaining = ventures.filter((item) => item.ventureKey.toLowerCase() !== venture.ventureKey.toLowerCase());
      const fallback = remaining[0];
      if (fallback) {
        router.push(buildTabHref(pathname, searchParams, fallback.ventureKey));
      }
    }

    router.refresh();
  };

  const deleteEditingVenture = async (): Promise<void> => {
    if (!editingVenture) {
      setError("Venture not found.");
      return;
    }

    await deleteVentureByKey(editingVenture, isEditingVentureActive);
  };

  return (
    <section className="venture-tabs" aria-label="Venture selector">
      <div className="venture-tabs-row" role="tablist" aria-label="Ventures">
        {ventures.map((venture) => {
          const isActive = activeVentureKey.toLowerCase() === venture.ventureKey.toLowerCase();
          return (
            <div key={venture.ventureKey} className={`venture-tab-item ${isActive ? "venture-tab-item-active" : ""}`}>
              <Link
                role="tab"
                aria-selected={isActive}
                className={`tab-btn venture-tab-link ${isActive ? "tab-btn-active" : ""}`}
                href={buildTabHref(pathname, searchParams, venture.ventureKey)}
              >
                {venture.name}
              </Link>
              {isAdmin ? (
                <div className="venture-tab-actions" aria-label={`Manage ${venture.name}`}>
                  <button
                    type="button"
                    className="venture-tab-icon"
                    title="Edit venture"
                    aria-label={`Edit venture ${venture.name}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openEditVenture(venture);
                    }}
                    disabled={isSavingSelectedVenture}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path
                        d="M3 17.25V21h3.75L18.81 8.94l-3.75-3.75L3 17.25zm17.71-10.04a1 1 0 0 0 0-1.41l-2.5-2.5a1 1 0 0 0-1.41 0l-1.96 1.96 3.75 3.75 2.12-2.1z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
        {isAdmin ? (
          <button
            type="button"
            className={`tab-btn tab-btn-add venture-add-btn ${isAddingVenture ? "tab-btn-active" : ""}`}
            onClick={isAddingVenture ? closeAddVenture : openAddVenture}
            aria-label="Add Venture"
          >
            Add Venture
          </button>
        ) : null}
      </div>

      {isAdmin && isAddingVenture ? (
        <form className="venture-add-form" onSubmit={(event) => void createVenture(event)}>
          <input
            name="ventureName"
            value={ventureName}
            onChange={(event) => setVentureName(event.target.value)}
            placeholder="Venture name"
            aria-label="Venture name"
            autoFocus
            disabled={isSavingVenture}
          />
          <button className="btn btn-add" type="submit" disabled={isSavingVenture}>
            Add venture
          </button>
          <button className="tab-btn" type="button" onClick={closeAddVenture} disabled={isSavingVenture}>
            Cancel
          </button>
        </form>
      ) : null}

      {isAdmin && editingVentureKey ? (
        <form className="venture-edit-form" onSubmit={(event) => void saveEditedVenture(event)}>
          <input
            name="editingVentureName"
            value={editingVentureNameDraft}
            onChange={(event) => setEditingVentureNameDraft(event.target.value)}
            placeholder="Venture name"
            aria-label="Edit venture name"
            autoFocus
            disabled={isSavingSelectedVenture}
          />
          <button className="btn" type="submit" disabled={isSavingSelectedVenture}>
            Save
          </button>
          <button className="btn btn-danger" type="button" onClick={() => void deleteEditingVenture()} disabled={isSavingSelectedVenture}>
            Delete
          </button>
          <button className="tab-btn" type="button" onClick={closeEditVenture} disabled={isSavingSelectedVenture}>
            Cancel
          </button>
        </form>
      ) : null}

      {error ? <p className="message danger">{error}</p> : null}
    </section>
  );
}
