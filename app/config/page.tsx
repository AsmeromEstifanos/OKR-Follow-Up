"use client";

import useCurrentUserEmail from "@/app/use-current-user-email";
import OwnerInput from "@/app/owner-input";
import { apiPath } from "@/lib/base-path";
import type { AppConfig } from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";

type ApiError = {
  error?: string;
};

type ApiActionState = "idle" | "loading" | "saving";

type AdminUser = {
  email: string;
  displayName?: string;
};

const OBJECTIVE_TYPE_VALUES = ["Aspirational", "Committed", "Learning"];
const OBJECTIVE_STATUS_VALUES = ["NotStarted", "OnTrack", "AtRisk", "OffTrack", "Done"];
const OBJECTIVE_CYCLE_VALUES = ["Q1", "Q2", "Q3", "Q4"];
const KR_METRIC_TYPE_VALUES = ["Delivery", "Financial", "Operational", "People", "Quality"];
const KR_STATUS_VALUES = ["NotStarted", "OnTrack", "AtRisk", "OffTrack", "Done"];
const CHECKIN_FREQUENCY_VALUES = ["Weekly", "BiWeekly", "Monthly", "AdHoc"];

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

function normalizeOptionValue(value: string): string {
  return value.trim();
}

function addOption(values: string[], value: string): string[] {
  const normalized = normalizeOptionValue(value);
  if (!normalized) {
    return values;
  }

  if (values.some((item) => item.toLowerCase() === normalized.toLowerCase())) {
    return values;
  }

  return [...values, normalized];
}

function removeOption(values: string[], value: string): string[] {
  return values.filter((item) => item.toLowerCase() !== value.toLowerCase());
}

function OptionEditor({
  title,
  options,
  addValue,
  disabled,
  onAddValueChange,
  onAdd,
  onRemove
}: {
  title: string;
  options: string[];
  addValue: string;
  disabled: boolean;
  onAddValueChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (value: string) => void;
}): JSX.Element {
  return (
    <article className="config-option-card">
      <h3 className="config-option-title">{title}</h3>
      <div className="config-option-add-row">
        <input
          value={addValue}
          onChange={(event) => onAddValueChange(event.target.value)}
          placeholder={`Add ${title} option`}
          disabled={disabled}
        />
        <button type="button" className="btn btn-add" onClick={onAdd} disabled={disabled}>
          Add
        </button>
      </div>
      <div className="config-option-list">
        {options.map((value) => (
          <div key={value} className="config-inline-row">
            <span>{value}</span>
            <button type="button" className="btn btn-danger" onClick={() => onRemove(value)} disabled={disabled}>
              Remove
            </button>
          </div>
        ))}
        {options.length === 0 ? <p className="meta">No options configured.</p> : null}
      </div>
    </article>
  );
}

export default function ConfigPage(): JSX.Element {
  const currentUserEmail = useCurrentUserEmail();
  const normalizedCurrentUser = normalizeEmail(currentUserEmail);

  const [config, setConfig] = useState<AppConfig | null>(null);
  const [state, setState] = useState<ApiActionState>("loading");
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");

  const [isAuthzLoading, setIsAuthzLoading] = useState<boolean>(true);
  const [isAdminUser, setIsAdminUser] = useState<boolean>(false);

  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [adminEmailDraft, setAdminEmailDraft] = useState<string>("");
  const [adminDisplayNameDraft, setAdminDisplayNameDraft] = useState<string>("");

  const [greenMin, setGreenMin] = useState<string>("70");
  const [amberMin, setAmberMin] = useState<string>("40");

  const [ventureName, setVentureName] = useState<string>("");
  const [departmentNameByVenture, setDepartmentNameByVenture] = useState<Record<string, string>>({});

  const [objectiveTypes, setObjectiveTypes] = useState<string[]>(OBJECTIVE_TYPE_VALUES);
  const [objectiveStatuses, setObjectiveStatuses] = useState<string[]>(OBJECTIVE_STATUS_VALUES);
  const [objectiveCycles, setObjectiveCycles] = useState<string[]>(OBJECTIVE_CYCLE_VALUES);
  const [keyResultMetricTypes, setKeyResultMetricTypes] = useState<string[]>(KR_METRIC_TYPE_VALUES);
  const [keyResultStatuses, setKeyResultStatuses] = useState<string[]>(KR_STATUS_VALUES);
  const [checkInFrequencies, setCheckInFrequencies] = useState<string[]>(CHECKIN_FREQUENCY_VALUES);
  const [objectiveTypeDraft, setObjectiveTypeDraft] = useState<string>("");
  const [objectiveStatusDraft, setObjectiveStatusDraft] = useState<string>("");
  const [objectiveCycleDraft, setObjectiveCycleDraft] = useState<string>("");
  const [krMetricTypeDraft, setKrMetricTypeDraft] = useState<string>("");
  const [krStatusDraft, setKrStatusDraft] = useState<string>("");
  const [checkInFrequencyDraft, setCheckInFrequencyDraft] = useState<string>("");

  const isBusy = state === "saving";

  const loadConfig = useCallback(async (): Promise<void> => {
    setState("loading");
    setError("");
    const response = await fetch(apiPath("/api/config"), { cache: "no-store" });
    const payload = await readJson<AppConfig & ApiError>(response);

    if (!response.ok || !payload || !("ragThresholds" in payload)) {
      setError(payload?.error ?? "Failed to load configuration.");
      setState("idle");
      return;
    }

    setConfig(payload);
    setGreenMin(String(payload.ragThresholds.greenMin));
    setAmberMin(String(payload.ragThresholds.amberMin));
    setObjectiveTypes(payload.fieldOptions.objectiveTypes);
    setObjectiveStatuses(payload.fieldOptions.objectiveStatuses);
    setObjectiveCycles(payload.fieldOptions.objectiveCycles);
    setKeyResultMetricTypes(payload.fieldOptions.keyResultMetricTypes);
    setKeyResultStatuses(payload.fieldOptions.keyResultStatuses);
    setCheckInFrequencies(payload.fieldOptions.checkInFrequencies);
    setState("idle");
  }, []);

  const loadAdmins = useCallback(async (): Promise<void> => {
    const response = await fetch(apiPath("/api/config/admins"), { cache: "no-store" });
    const payload = await readJson<{ admins?: AdminUser[] } & ApiError>(response);

    if (!response.ok) {
      setError(payload?.error ?? "Failed to load admin users.");
      return;
    }

    setAdmins(payload?.admins ?? []);
  }, []);

  const loadAuthz = useCallback(async (): Promise<void> => {
    setIsAuthzLoading(true);
    try {
      const response = await fetch(apiPath("/api/authz/me"), {
        method: "GET",
        headers: {
          "x-user-email": normalizedCurrentUser
        }
      });
      const payload = await readJson<{ isAdmin?: boolean }>(response);
      setIsAdminUser(Boolean(payload?.isAdmin));
    } catch {
      setIsAdminUser(false);
    } finally {
      setIsAuthzLoading(false);
    }
  }, [normalizedCurrentUser]);

  useEffect(() => {
    void loadAuthz();
  }, [loadAuthz]);

  useEffect(() => {
    if (!isAdminUser) {
      return;
    }

    void loadConfig();
    void loadAdmins();
  }, [isAdminUser, loadAdmins, loadConfig]);

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

    const response = await fetch(apiPath("/api/config/rag"), {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-user-email": normalizedCurrentUser
      },
      body: JSON.stringify({
        greenMin: nextGreen,
        amberMin: nextAmber
      })
    });
    const payload = await readJson<AppConfig & ApiError>(response);

    if (!response.ok || !payload || !("ragThresholds" in payload)) {
      setError(payload?.error ?? "Failed to update RAG thresholds.");
      setState("idle");
      return;
    }

    setConfig(payload);
    setMessage("RAG thresholds updated.");
    setState("idle");
  };

  const saveFieldOptions = async (): Promise<void> => {
    if (
      objectiveTypes.length === 0 ||
      objectiveStatuses.length === 0 ||
      objectiveCycles.length === 0 ||
      keyResultMetricTypes.length === 0 ||
      keyResultStatuses.length === 0 ||
      checkInFrequencies.length === 0
    ) {
      setError("Each dropdown must contain at least one option.");
      return;
    }

    setState("saving");
    setError("");
    setMessage("");

    const response = await fetch(apiPath("/api/config/field-options"), {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-user-email": normalizedCurrentUser
      },
      body: JSON.stringify({
        objectiveTypes,
        objectiveStatuses,
        objectiveCycles,
        keyResultMetricTypes,
        keyResultStatuses,
        checkInFrequencies
      })
    });
    const payload = await readJson<AppConfig & ApiError>(response);

    if (!response.ok || !payload || !("fieldOptions" in payload)) {
      setError(payload?.error ?? "Failed to update field options.");
      setState("idle");
      return;
    }

    setConfig(payload);
    setMessage("Dropdown options updated.");
    setState("idle");
  };

  const addAdmin = async (): Promise<void> => {
    const email = normalizeEmail(adminEmailDraft);
    if (!email) {
      setError("Admin email is required.");
      return;
    }

    setState("saving");
    setError("");
    setMessage("");

    const response = await fetch(apiPath("/api/config/admins"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-email": normalizedCurrentUser
      },
      body: JSON.stringify({ email, displayName: adminDisplayNameDraft.trim() })
    });
    const payload = await readJson<{ admins?: AdminUser[] } & ApiError>(response);
    if (!response.ok) {
      setError(payload?.error ?? "Failed to add admin.");
      setState("idle");
      return;
    }

    setAdmins(payload?.admins ?? []);
    setAdminEmailDraft("");
    setAdminDisplayNameDraft("");
    setMessage("Admin user added.");
    setState("idle");
  };

  const removeAdmin = async (email: string): Promise<void> => {
    setState("saving");
    setError("");
    setMessage("");

    const response = await fetch(apiPath(`/api/config/admins/${encodeURIComponent(email)}`), {
      method: "DELETE",
      headers: {
        "x-user-email": normalizedCurrentUser
      }
    });
    const payload = await readJson<{ admins?: AdminUser[] } & ApiError>(response);
    if (!response.ok) {
      setError(payload?.error ?? "Failed to remove admin.");
      setState("idle");
      return;
    }

    setAdmins(payload?.admins ?? []);
    setMessage("Admin user removed.");
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

    const response = await fetch(apiPath("/api/config/ventures"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-email": normalizedCurrentUser
      },
      body: JSON.stringify({ name: ventureName.trim() })
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

    const response = await fetch(apiPath(`/api/config/ventures/${encodeURIComponent(key)}`), {
      method: "DELETE",
      headers: {
        "x-user-email": normalizedCurrentUser
      }
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

    const response = await fetch(apiPath(`/api/config/ventures/${encodeURIComponent(ventureKeyValue)}/departments`), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-email": normalizedCurrentUser
      },
      body: JSON.stringify({ name: departmentName.trim() })
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
      apiPath(`/api/config/ventures/${encodeURIComponent(ventureKeyValue)}/departments/${encodeURIComponent(departmentKeyValue)}`),
      {
        method: "DELETE",
        headers: {
          "x-user-email": normalizedCurrentUser
        }
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

  if (isAuthzLoading) {
    return (
      <section className="section">
        <p className="meta">Checking access...</p>
      </section>
    );
  }

  if (!isAdminUser) {
    return (
      <section className="section">
        <h2>Configuration</h2>
        <p className="meta">Only admin users can access configuration.</p>
      </section>
    );
  }

  return (
    <div>
      <h1 className="page-title">Configuration</h1>
      <p className="subtitle">Manage admins, dropdown options, RAG ranges, ventures, and departments.</p>

      <section className="section">
        <h2>Admin Users</h2>
        <div className="config-grid">
          <OwnerInput
            id="adminEmail"
            label="Admin Email"
            value={adminEmailDraft}
            onChange={(value) => {
              setAdminEmailDraft(value);
              setAdminDisplayNameDraft("");
            }}
            selectValue="email"
            onSelectUser={(user) => {
              setAdminDisplayNameDraft(user?.displayName ?? "");
            }}
            placeholder="Type name or email"
            disabled={isBusy}
          />
        </div>
        <div className="actions">
          <button className="btn btn-add" type="button" onClick={() => void addAdmin()} disabled={isBusy}>
            Add Admin
          </button>
        </div>
        <div className="config-checklist">
          {admins.length === 0 ? <p className="meta">No admin users configured yet.</p> : null}
          {admins.map((admin) => (
            <div key={admin.email} className="config-inline-row">
              <span>
                {admin.displayName ? `${admin.displayName} ` : ""}
                <span className="meta">({admin.email})</span>
              </span>
              <button className="btn btn-danger" type="button" onClick={() => void removeAdmin(admin.email)} disabled={isBusy}>
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Dropdown Field Options</h2>
        <div className="config-option-grid">
          <OptionEditor
            title="Objective Type"
            options={objectiveTypes}
            addValue={objectiveTypeDraft}
            disabled={isBusy}
            onAddValueChange={setObjectiveTypeDraft}
            onAdd={() => {
              setObjectiveTypes((current) => addOption(current, objectiveTypeDraft));
              setObjectiveTypeDraft("");
            }}
            onRemove={(value) => setObjectiveTypes((current) => removeOption(current, value))}
          />
          <OptionEditor
            title="Objective Health"
            options={objectiveStatuses}
            addValue={objectiveStatusDraft}
            disabled={isBusy}
            onAddValueChange={setObjectiveStatusDraft}
            onAdd={() => {
              setObjectiveStatuses((current) => addOption(current, objectiveStatusDraft));
              setObjectiveStatusDraft("");
            }}
            onRemove={(value) => setObjectiveStatuses((current) => removeOption(current, value))}
          />
          <OptionEditor
            title="OKR Cycle"
            options={objectiveCycles}
            addValue={objectiveCycleDraft}
            disabled={isBusy}
            onAddValueChange={setObjectiveCycleDraft}
            onAdd={() => {
              setObjectiveCycles((current) => addOption(current, objectiveCycleDraft));
              setObjectiveCycleDraft("");
            }}
            onRemove={(value) => setObjectiveCycles((current) => removeOption(current, value))}
          />
          <OptionEditor
            title="KR Metric Type"
            options={keyResultMetricTypes}
            addValue={krMetricTypeDraft}
            disabled={isBusy}
            onAddValueChange={setKrMetricTypeDraft}
            onAdd={() => {
              setKeyResultMetricTypes((current) => addOption(current, krMetricTypeDraft));
              setKrMetricTypeDraft("");
            }}
            onRemove={(value) => setKeyResultMetricTypes((current) => removeOption(current, value))}
          />
          <OptionEditor
            title="KR Status"
            options={keyResultStatuses}
            addValue={krStatusDraft}
            disabled={isBusy}
            onAddValueChange={setKrStatusDraft}
            onAdd={() => {
              setKeyResultStatuses((current) => addOption(current, krStatusDraft));
              setKrStatusDraft("");
            }}
            onRemove={(value) => setKeyResultStatuses((current) => removeOption(current, value))}
          />
          <OptionEditor
            title="Check-in Frequency"
            options={checkInFrequencies}
            addValue={checkInFrequencyDraft}
            disabled={isBusy}
            onAddValueChange={setCheckInFrequencyDraft}
            onAdd={() => {
              setCheckInFrequencies((current) => addOption(current, checkInFrequencyDraft));
              setCheckInFrequencyDraft("");
            }}
            onRemove={(value) => setCheckInFrequencies((current) => removeOption(current, value))}
          />
        </div>
        <div className="actions">
          <button className="btn" type="button" onClick={() => void saveFieldOptions()} disabled={isBusy}>
            Save Dropdown Config
          </button>
        </div>
      </section>

      <section className="section">
        <h2>RAG Definition</h2>
        <div className="config-grid">
          <div className="field">
            <label htmlFor="greenMin">Green Min (%)</label>
            <input id="greenMin" type="number" value={greenMin} onChange={(event) => setGreenMin(event.target.value)} disabled={isBusy} />
          </div>
          <div className="field">
            <label htmlFor="amberMin">Amber Min (%)</label>
            <input id="amberMin" type="number" value={amberMin} onChange={(event) => setAmberMin(event.target.value)} disabled={isBusy} />
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
                  <button className="btn btn-danger" type="button" onClick={() => void removeVenture(venture.ventureKey)} disabled={isBusy}>
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
                  <button className="btn btn-add" type="button" onClick={() => void addDepartment(venture.ventureKey)} disabled={isBusy}>
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
