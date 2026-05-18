"use client";

import useCurrentUserEmail from "@/app/use-current-user-email";
import { apiPath } from "@/lib/base-path";
import type { NotificationSettings } from "@/lib/notification-settings";
import { RULE_DEFINITIONS, RULE_IDS, type RuleId } from "@/lib/notification-rules";
import { useEffect, useState } from "react";

function buildFallbackSettings(): NotificationSettings {
  const rules = RULE_IDS.reduce(
    (acc, id) => {
      acc[id] = { enabled: false };
      return acc;
    },
    {} as Record<RuleId, { enabled: boolean }>
  );
  return { rules };
}

export default function NotificationSettingsPage(): JSX.Element {
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

  function toggleRule(id: RuleId, enabled: boolean): void {
    setSettings((prev) => ({
      ...prev,
      rules: { ...prev.rules, [id]: { enabled } }
    }));
  }

  if (isLoading) {
    return (
      <div className="page-container">
        <p className="meta">Loading notification settings…</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <header className="section-header">
        <h2>Notification Settings</h2>
      </header>
      <p className="meta">
        Enable the scheduled reminder emails the OKR system should send. The scheduler runs every 15 minutes
        and dispatches each enabled rule once on its configured day at the configured time.
      </p>

      {error ? <p className="message danger">{error}</p> : null}
      {message ? <p className="message success">{message}</p> : null}

      <div className="notif-rules-grid">
        {RULE_IDS.map((id) => {
          const rule = RULE_DEFINITIONS[id];
          const enabled = settings.rules[id]?.enabled ?? false;
          return (
            <section key={id} className="config-option-card">
              <header className="notif-rule-head">
                <div>
                  <h3 className="config-option-title">{rule.label}</h3>
                  <div className="notif-rule-schedule">{rule.scheduleLabel}</div>
                </div>
                <label className="notif-settings-toggle">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => toggleRule(id, e.target.checked)}
                    disabled={isSaving}
                  />
                  <span>{enabled ? "On" : "Off"}</span>
                </label>
              </header>
              <p className="notif-rule-message">&ldquo;{rule.message}&rdquo;</p>
              <p className="notif-rule-shows">
                <span className="notif-rule-shows-label">What it shows:</span> {rule.contentLabel}
              </p>
            </section>
          );
        })}
      </div>

      <div className="notif-settings-save-row">
        <button type="button" className="btn" onClick={() => void saveSettings()} disabled={isSaving}>
          {isSaving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
