import { readNotificationSettings } from "@/lib/notification-settings";
import { sendAggregatedReminders, type AggregatedReminder, type SendRemindersResult } from "@/lib/notifications";
import { isMissingCheckin } from "@/lib/okr-rules";
import { listKeyResults, listObjectives, listPeriods, logUserActivity } from "@/lib/store";

export type ReminderRunResult = {
  ranAt: string;
  candidates: { preDeadline: number; overdueCheckIn: number; atRiskAlert: number; weeklyDigest: number };
  recipients: number;
  sendResult: SendRemindersResult | { error: string };
};

function daysUntil(dueDate: string | null | undefined, now: Date): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate).getTime();
  if (!Number.isFinite(due)) return null;
  return Math.ceil((due - now.getTime()) / (1000 * 60 * 60 * 24));
}

function lowerEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

// Computes who should receive which reminders (based on the saved settings) and
// sends one aggregated email per owner. Shared by the daily cron endpoint and the
// admin "Send Reminders" button so both behave identically.
export async function runReminders(): Promise<ReminderRunResult> {
  const now = new Date();
  const settings = await readNotificationSettings();

  const [periods, allObjectives, allKrs] = await Promise.all([
    listPeriods(),
    listObjectives({}),
    listKeyResults({})
  ]);
  const periodMap = new Map(periods.map((p) => [p.periodKey, p]));
  const activePeriodKeys = new Set(periods.filter((p) => p.status === "Active").map((p) => p.periodKey));

  const aggregated = new Map<string, AggregatedReminder>();
  const entryFor = (email: string): AggregatedReminder => {
    let entry = aggregated.get(email);
    if (!entry) {
      entry = {
        preDeadlineKrs: [],
        overdueCheckInKrs: [],
        atRiskObjectives: [],
        digestObjectives: [],
        digestKrs: []
      };
      aggregated.set(email, entry);
    }
    return entry;
  };

  const candidates = { preDeadline: 0, overdueCheckIn: 0, atRiskAlert: 0, weeklyDigest: 0 };

  if (settings.preDeadline.enabled) {
    for (const kr of allKrs) {
      if (!activePeriodKeys.has(kr.periodKey)) continue;
      if (kr.progressPct >= settings.preDeadline.progressThreshold) continue;
      const days = daysUntil(kr.dueDate, now);
      if (days === null || days < 0 || days > settings.preDeadline.daysBefore) continue;
      const email = lowerEmail(kr.ownerEmail);
      if (!email) continue;
      entryFor(email).preDeadlineKrs.push(kr);
      candidates.preDeadline++;
    }
  }

  if (settings.overdueCheckIn.enabled) {
    for (const kr of allKrs) {
      const period = periodMap.get(kr.periodKey);
      if (!period || !isMissingCheckin(kr.lastCheckinAt, period.status, now)) continue;
      const email = lowerEmail(kr.ownerEmail);
      if (!email) continue;
      entryFor(email).overdueCheckInKrs.push(kr);
      candidates.overdueCheckIn++;
    }
  }

  if (settings.atRiskAlert.enabled) {
    for (const obj of allObjectives) {
      const period = periodMap.get(obj.periodKey);
      if (period?.status !== "Active") continue;
      if (obj.rag !== "Red" && obj.rag !== "Amber") continue;
      const email = lowerEmail(obj.ownerEmail);
      if (!email) continue;
      entryFor(email).atRiskObjectives.push(obj);
      candidates.atRiskAlert++;
    }
  }

  const digestActive =
    settings.weeklyDigest.enabled && now.getDay() === settings.weeklyDigest.dayOfWeek;
  if (digestActive) {
    for (const obj of allObjectives) {
      if (!activePeriodKeys.has(obj.periodKey)) continue;
      const email = lowerEmail(obj.ownerEmail);
      if (!email) continue;
      entryFor(email).digestObjectives.push(obj);
      candidates.weeklyDigest++;
    }
    for (const kr of allKrs) {
      if (!activePeriodKeys.has(kr.periodKey)) continue;
      const email = lowerEmail(kr.ownerEmail);
      if (!email) continue;
      entryFor(email).digestKrs.push(kr);
    }
  }

  let sendResult: SendRemindersResult | { error: string };
  try {
    sendResult = await sendAggregatedReminders(aggregated);
  } catch (err) {
    sendResult = { error: err instanceof Error ? err.message : String(err) };
  }

  return {
    ranAt: now.toISOString(),
    candidates,
    recipients: aggregated.size,
    sendResult
  };
}

// Records a reminder run in the activity log. Never throws — logging failures
// must not break the actual send.
export async function logReminderRun(
  userEmail: string,
  routePath: string,
  result: ReminderRunResult
): Promise<void> {
  try {
    await logUserActivity({
      userEmail: userEmail || "scheduler",
      activityName: "Sent reminder emails",
      httpMethod: "POST",
      routePath,
      occurredAt: result.ranAt,
      entityType: "notification",
      detailsJson: JSON.stringify({
        candidates: result.candidates,
        recipients: result.recipients,
        sendResult: result.sendResult
      })
    });
  } catch {
    // ignore — activity logging is best-effort
  }
}
