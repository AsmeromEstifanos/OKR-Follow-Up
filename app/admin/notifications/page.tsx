"use client";

import useCurrentUserEmail from "@/app/use-current-user-email";
import { apiPath } from "@/lib/base-path";
import type { NotificationSettings } from "@/lib/notification-settings";
import { useEffect, useState } from "react";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const FALLBACK: NotificationSettings = {
  preDeadline: { enabled: true, daysBefore: 3, progressThreshold: 80 },
  overdueCheckIn: { enabled: true },
  weeklyDigest: { enabled: false, dayOfWeek: 1 },
  atRiskAlert: { enabled: true }
};

export default function NotificationSettingsPage(): JSX.Element {
  const userEmail = useCurrentUserEmail();
  const [settings, setSettings] = useState<NotificationSettings>(FALLBACK);
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
        Configure which automated reminder emails the scheduled job sends. The scheduler hits the API once
        daily; only enabled rules below will actually dispatch emails.
      </p>

      {error ? <p className="message danger">{error}</p> : null}
      {message ? <p className="message success">{message}</p> : null}

      <div className="notif-settings-grid">
        <section className="config-option-card">
          <header className="notif-settings-row">
            <h3 className="config-option-title">Pre-deadline reminders</h3>
            <label className="notif-settings-toggle">
              <input
                type="checkbox"
                checked={settings.preDeadline.enabled}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    preDeadline: { ...s.preDeadline, enabled: e.target.checked }
                  }))
                }
                disabled={isSaving}
              />
              <span>Enabled</span>
            </label>
          </header>
          <p className="meta">
            Emails KR owners when their KR is due soon and progress is below the threshold.
          </p>
          <div className="notif-settings-fields">
            <label>
              Days before due date
              <input
                type="number"
                min={1}
                max={30}
                value={settings.preDeadline.daysBefore}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    preDeadline: { ...s.preDeadline, daysBefore: Number(e.target.value) || 0 }
                  }))
                }
                disabled={isSaving || !settings.preDeadline.enabled}
              />
            </label>
            <label>
              Progress threshold (%)
              <input
                type="number"
                min={0}
                max={100}
                value={settings.preDeadline.progressThreshold}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    preDeadline: { ...s.preDeadline, progressThreshold: Number(e.target.value) || 0 }
                  }))
                }
                disabled={isSaving || !settings.preDeadline.enabled}
              />
            </label>
          </div>
        </section>

        <section className="config-option-card">
          <header className="notif-settings-row">
            <h3 className="config-option-title">Overdue check-in reminders</h3>
            <label className="notif-settings-toggle">
              <input
                type="checkbox"
                checked={settings.overdueCheckIn.enabled}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    overdueCheckIn: { enabled: e.target.checked }
                  }))
                }
                disabled={isSaving}
              />
              <span>Enabled</span>
            </label>
          </header>
          <p className="meta">
            Emails owners whose KRs have no recent check-in (uses the system-wide check-in window).
          </p>
        </section>

        <section className="config-option-card">
          <header className="notif-settings-row">
            <h3 className="config-option-title">At-risk objective alerts</h3>
            <label className="notif-settings-toggle">
              <input
                type="checkbox"
                checked={settings.atRiskAlert.enabled}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    atRiskAlert: { enabled: e.target.checked }
                  }))
                }
                disabled={isSaving}
              />
              <span>Enabled</span>
            </label>
          </header>
          <p className="meta">Emails owners of objectives currently rated Red or Amber.</p>
        </section>

        <section className="config-option-card">
          <header className="notif-settings-row">
            <h3 className="config-option-title">Weekly digest</h3>
            <label className="notif-settings-toggle">
              <input
                type="checkbox"
                checked={settings.weeklyDigest.enabled}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    weeklyDigest: { ...s.weeklyDigest, enabled: e.target.checked }
                  }))
                }
                disabled={isSaving}
              />
              <span>Enabled</span>
            </label>
          </header>
          <p className="meta">
            Sends each owner a snapshot of their active objectives and KRs once a week.
          </p>
          <div className="notif-settings-fields">
            <label>
              Day of week
              <select
                value={settings.weeklyDigest.dayOfWeek}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    weeklyDigest: { ...s.weeklyDigest, dayOfWeek: Number(e.target.value) }
                  }))
                }
                disabled={isSaving || !settings.weeklyDigest.enabled}
              >
                {DAY_LABELS.map((label, idx) => (
                  <option key={idx} value={idx}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
      </div>

      <div className="notif-settings-save-row">
        <button type="button" className="btn" onClick={() => void saveSettings()} disabled={isSaving}>
          {isSaving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
