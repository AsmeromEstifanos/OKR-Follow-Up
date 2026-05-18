"use client";

import useCurrentUserEmail from "@/app/use-current-user-email";
import { apiPath } from "@/lib/base-path";
import type { NotificationSettings, RuleSettings } from "@/lib/notification-settings";
import {
  RULE_DEFINITIONS,
  RULE_IDS,
  effectiveRule,
  formatScheduleLabel,
  type RuleId
} from "@/lib/notification-rules";
import { useEffect, useState } from "react";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function defaultSettingsFor(id: RuleId): RuleSettings {
  const def = RULE_DEFINITIONS[id];
  return {
    enabled: false,
    hour: "hour" in def.schedule ? def.schedule.hour : 9,
    minute: "minute" in def.schedule ? def.schedule.minute : 0,
    dayOfWeek: def.schedule.kind === "weekly" ? def.schedule.dayOfWeek : 1,
    dayOfMonth: def.schedule.kind === "monthly" ? def.schedule.dayOfMonth : 1,
    message: def.message
  };
}

function buildFallbackSettings(): NotificationSettings {
  const rules = RULE_IDS.reduce(
    (acc, id) => {
      acc[id] = defaultSettingsFor(id);
      return acc;
    },
    {} as Record<RuleId, RuleSettings>
  );
  return { rules };
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function parseTimeInput(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

export default function NotificationSettingsSection(): JSX.Element {
  const userEmail = useCurrentUserEmail();
  const [settings, setSettings] = useState<NotificationSettings>(() => buildFallbackSettings());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    if (!userEmail) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError("");
      try {
        const res = await fetch(apiPath("/api/notifications/settings"), {
          headers: { "x-user-email": userEmail },
          cache: "no-store"
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Failed to load settings.");
        }
        const data = (await res.json()) as NotificationSettings;
        if (!cancelled) setSettings(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load settings.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userEmail]);

  async function saveSettings(): Promise<void> {
    if (!userEmail || isSaving) return;
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(apiPath("/api/notifications/settings"), {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-user-email": userEmail },
        body: JSON.stringify(settings)
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to save settings.");
      }
      const saved = (await res.json()) as NotificationSettings;
      setSettings(saved);
      setMessage("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  }

  function updateRule(id: RuleId, patch: Partial<RuleSettings>): void {
    setSettings((prev) => ({
      ...prev,
      rules: { ...prev.rules, [id]: { ...prev.rules[id], ...patch } }
    }));
  }

  function resetRule(id: RuleId): void {
    setSettings((prev) => ({
      ...prev,
      rules: { ...prev.rules, [id]: { ...defaultSettingsFor(id), enabled: prev.rules[id]?.enabled ?? false } }
    }));
  }

  if (isLoading) {
    return <p className="meta">Loading notification settings…</p>;
  }

  return (
    <>
      <p className="meta">
        Enable, schedule, and word the automated reminder emails the OKR system sends. The scheduler runs
        every 15 minutes and dispatches each enabled rule once on its configured day at the configured time.
      </p>

      {error ? <p className="message danger">{error}</p> : null}
      {message ? <p className="message success">{message}</p> : null}

      <div className="notif-rules-grid">
        {RULE_IDS.map((id) => {
          const def = RULE_DEFINITIONS[id];
          const cfg = settings.rules[id] ?? defaultSettingsFor(id);
          const eff = effectiveRule(id, cfg);
          const kind = def.schedule.kind;
          const timeValue = `${pad2(cfg.hour)}:${pad2(cfg.minute)}`;
          return (
            <section key={id} className="config-option-card">
              <header className="notif-rule-head">
                <div>
                  <h3 className="config-option-title">{def.label}</h3>
                  <div className="notif-rule-schedule">{formatScheduleLabel(eff.schedule)}</div>
                </div>
                <label className="notif-settings-toggle">
                  <input
                    type="checkbox"
                    checked={cfg.enabled}
                    onChange={(e) => updateRule(id, { enabled: e.target.checked })}
                    disabled={isSaving}
                  />
                  <span>{cfg.enabled ? "On" : "Off"}</span>
                </label>
              </header>

              <div className="notif-rule-fields">
                {kind === "weekly" && (
                  <label className="notif-rule-field">
                    Day
                    <select
                      value={cfg.dayOfWeek}
                      onChange={(e) => updateRule(id, { dayOfWeek: Number(e.target.value) })}
                      disabled={isSaving || !cfg.enabled}
                    >
                      {DAY_NAMES.map((label, idx) => (
                        <option key={idx} value={idx}>{label}</option>
                      ))}
                    </select>
                  </label>
                )}
                {kind === "monthly" && (
                  <label className="notif-rule-field">
                    Day of month
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={cfg.dayOfMonth}
                      onChange={(e) => updateRule(id, { dayOfMonth: Number(e.target.value) || 1 })}
                      disabled={isSaving || !cfg.enabled}
                    />
                  </label>
                )}
                <label className="notif-rule-field">
                  Time
                  <input
                    type="time"
                    value={timeValue}
                    onChange={(e) => {
                      const parsed = parseTimeInput(e.target.value);
                      if (parsed) updateRule(id, { hour: parsed.hour, minute: parsed.minute });
                    }}
                    disabled={isSaving || !cfg.enabled}
                  />
                </label>
              </div>

              <label className="notif-rule-field notif-rule-field-message">
                Message
                <textarea
                  value={cfg.message}
                  onChange={(e) => updateRule(id, { message: e.target.value })}
                  disabled={isSaving || !cfg.enabled}
                  rows={2}
                />
              </label>

              <p className="notif-rule-shows">
                <span className="notif-rule-shows-label">What it shows:</span> {def.contentLabel}
              </p>

              <button
                type="button"
                className="notif-rule-reset"
                onClick={() => resetRule(id)}
                disabled={isSaving}
              >
                Reset to defaults
              </button>
            </section>
          );
        })}
      </div>

      <div className="notif-settings-save-row">
        <button type="button" className="btn" onClick={() => void saveSettings()} disabled={isSaving}>
          {isSaving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </>
  );
}
