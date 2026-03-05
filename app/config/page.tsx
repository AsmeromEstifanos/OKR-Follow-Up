"use client";

import type { AppConfig } from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";

type ApiError = {
  error?: string;
};

type ApiActionState = "idle" | "loading" | "saving";

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

export default function ConfigPage(): JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [state, setState] = useState<ApiActionState>("loading");
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");

  const [greenMin, setGreenMin] = useState<string>("70");
  const [amberMin, setAmberMin] = useState<string>("40");

  const [ventureName, setVentureName] = useState<string>("");

  const [departmentNameByVenture, setDepartmentNameByVenture] = useState<Record<string, string>>({});

  const isBusy = state === "saving";

  const loadConfig = useCallback(async (): Promise<void> => {
    setState("loading");
    setError("");
    const response = await fetch("/api/config", { cache: "no-store" });
    const payload = await readJson<AppConfig & ApiError>(response);

    if (!response.ok) {
      setError(payload?.error ?? "Failed to load configuration.");
      setState("idle");
      return;
    }

    if (!payload || !("ragThresholds" in payload)) {
      setError("Config API returned an unexpected payload.");
      setState("idle");
      return;
    }

    setConfig(payload);
    setGreenMin(String(payload.ragThresholds.greenMin));
    setAmberMin(String(payload.ragThresholds.amberMin));
    setState("idle");
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const ragPreview = useMemo(() => {
    const nextGreen = Number(greenMin);
    const nextAmber = Number(amberMin);

    if (Number.isNaN(nextGreen) || Number.isNaN(nextAmber)) {
      return "Enter numeric values to preview.";
    }

    return `Green: ${nextGreen}-100 | Amber: ${nextAmber}-${nextGreen - 1} | Red: 0-${nextAmber - 1}`;
  }, [greenMin, amberMin]);

  const saveRagConfig = async (): Promise<void> => {
    const nextGreen = Number(greenMin);
    const nextAmber = Number(amberMin);

    if (Number.isNaN(nextGreen) || Number.isNaN(nextAmber)) {
      setError("RAG thresholds must be numeric.");
      return;
    }

    setState("saving");
    setError("");
    setMessage("");

    const response = await fetch("/api/config/rag", {
      method: "PATCH",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        greenMin: nextGreen,
        amberMin: nextAmber
      })
    });
    const payload = await readJson<AppConfig & ApiError>(response);

    if (!response.ok) {
      setError(payload?.error ?? "Failed to update RAG thresholds.");
      setState("idle");
      return;
    }

    if (!payload || !("ragThresholds" in payload)) {
      setError("Config API returned an unexpected payload.");
      setState("idle");
      return;
    }

    setConfig(payload);
    setMessage("RAG thresholds updated.");
    setState("idle");
  };

  const addVenture = async (): Promise<void> => {
    if (!ventureName.trim()) {
      setError("Venture name is required.");
      return;
    }

    setState("saving");
    setError("");
    setMessage("");

    const response = await fetch("/api/config/ventures", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name: ventureName.trim()
      })
    });
    const payload = await readJson<ApiError>(response);

    if (!response.ok) {
      setError(payload?.error ?? "Failed to add venture.");
      setState("idle");
      return;
    }

    setVentureName("");
    setMessage("Venture added.");
    await loadConfig();
  };

  const removeVenture = async (key: string): Promise<void> => {
    setState("saving");
    setError("");
    setMessage("");

    const response = await fetch(`/api/config/ventures/${encodeURIComponent(key)}`, {
      method: "DELETE"
    });
    const payload = await readJson<ApiError>(response);

    if (!response.ok) {
      setError(payload?.error ?? "Failed to delete venture.");
      setState("idle");
      return;
    }

    setMessage("Venture deleted.");
    await loadConfig();
  };

  const addDepartment = async (ventureKeyValue: string): Promise<void> => {
    const departmentName = departmentNameByVenture[ventureKeyValue] ?? "";

    if (!departmentName.trim()) {
      setError("Department name is required.");
      return;
    }

    setState("saving");
    setError("");
    setMessage("");

    const response = await fetch(`/api/config/ventures/${encodeURIComponent(ventureKeyValue)}/departments`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name: departmentName.trim()
      })
    });
    const payload = await readJson<ApiError>(response);

    if (!response.ok) {
      setError(payload?.error ?? "Failed to add department.");
      setState("idle");
      return;
    }

    setDepartmentNameByVenture((previous) => ({ ...previous, [ventureKeyValue]: "" }));
    setMessage(`Department added to ${ventureKeyValue}.`);
    await loadConfig();
  };

  const removeDepartment = async (ventureKeyValue: string, departmentKeyValue: string): Promise<void> => {
    setState("saving");
    setError("");
    setMessage("");

    const response = await fetch(
      `/api/config/ventures/${encodeURIComponent(ventureKeyValue)}/departments/${encodeURIComponent(departmentKeyValue)}`,
      {
        method: "DELETE"
      }
    );
    const payload = await readJson<ApiError>(response);

    if (!response.ok) {
      setError(payload?.error ?? "Failed to delete department.");
      setState("idle");
      return;
    }

    setMessage(`Department removed from ${ventureKeyValue}.`);
    await loadConfig();
  };

  return (
    <div>
      <h1 className="page-title">Configuration</h1>
      <p className="subtitle">Manage RAG ranges, ventures, and departments. IDs are auto-generated internally.</p>

      <section className="section">
        <h2>RAG Definition</h2>
        <div className="config-grid">
          <div className="field">
            <label htmlFor="greenMin">Green Min (%)</label>
            <input
              id="greenMin"
              type="number"
              value={greenMin}
              onChange={(event) => setGreenMin(event.target.value)}
              disabled={isBusy}
            />
          </div>
          <div className="field">
            <label htmlFor="amberMin">Amber Min (%)</label>
            <input
              id="amberMin"
              type="number"
              value={amberMin}
              onChange={(event) => setAmberMin(event.target.value)}
              disabled={isBusy}
            />
          </div>
        </div>
        <p className="meta">{ragPreview}</p>
        <div className="actions">
          <button className="btn" type="button" onClick={() => void saveRagConfig()} disabled={isBusy}>
            Save RAG
          </button>
        </div>
      </section>

      <section className="section">
        <h2>Ventures</h2>
        <div className="config-grid">
          <div className="field">
            <label htmlFor="ventureName">Venture Name</label>
            <input
              id="ventureName"
              value={ventureName}
              onChange={(event) => setVentureName(event.target.value)}
              placeholder="New Venture"
              disabled={isBusy}
            />
          </div>
        </div>
        <div className="actions">
          <button className="btn btn-add" type="button" onClick={() => void addVenture()} disabled={isBusy}>
            Add Venture
          </button>
        </div>

        {!config ? (
          <p className="meta">Loading...</p>
        ) : config.ventures.length === 0 ? (
          <p className="meta">No ventures configured yet.</p>
        ) : (
          <div className="venture-grid">
            {config.ventures.map((venture) => (
              <article className="venture-card" key={venture.ventureKey}>
                <div className="row-between">
                  <div>
                    <h3>{venture.name}</h3>
                  </div>
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={() => void removeVenture(venture.ventureKey)}
                    disabled={isBusy}
                  >
                    Delete
                  </button>
                </div>

                <h4>Departments</h4>
                {venture.departments.length === 0 ? (
                  <p className="meta">No departments yet.</p>
                ) : (
                  <ul className="dept-list">
                    {venture.departments.map((department) => (
                      <li key={department.departmentKey}>
                        <span>{department.name}</span>
                        <button
                          className="btn btn-danger"
                          type="button"
                          onClick={() => void removeDepartment(venture.ventureKey, department.departmentKey)}
                          disabled={isBusy}
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="config-grid">
                  <div className="field">
                    <label htmlFor={`department-name-${venture.ventureKey}`}>Department Name</label>
                    <input
                      id={`department-name-${venture.ventureKey}`}
                      value={departmentNameByVenture[venture.ventureKey] ?? ""}
                      onChange={(event) =>
                        setDepartmentNameByVenture((previous) => ({
                          ...previous,
                          [venture.ventureKey]: event.target.value
                        }))
                      }
                      placeholder="Department Name"
                      disabled={isBusy}
                    />
                  </div>
                </div>
                <div className="actions">
                  <button
                    className="btn btn-add"
                    type="button"
                    onClick={() => void addDepartment(venture.ventureKey)}
                    disabled={isBusy}
                  >
                    Add Department
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {message ? <p className="message">{message}</p> : null}
      {error ? <p className="message danger">{error}</p> : null}
      {state === "loading" ? <p className="meta">Refreshing configuration...</p> : null}
    </div>
  );
}
