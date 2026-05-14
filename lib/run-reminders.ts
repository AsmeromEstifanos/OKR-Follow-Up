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

export type ReminderRecipientPreview = {
  email: string;
  name: string;
  summary: string;
  preDeadline: number;
  overdueCheckIn: number;
  atRisk: number;
  digest: number;
};

export type ReminderPreviewResult = {
  candidates: { preDeadline: number; overdueCheckIn: number; atRiskAlert: number; weeklyDigest: number };
  recipients: ReminderRecipientPreview[];
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

type AggregatedBuild = {
  aggregated: Map<string, AggregatedReminder>;
  candidates: { preDeadline: number; overdueCheckIn: number; atRiskAlert: number; weeklyDigest: number };
  fromEmail: string;
};

// Builds the per-owner aggregated reminder map from live OKR data + saved
// settings. Pure computation — does not send anything.
async function buildAggregatedReminders(now: Date): Promise<AggregatedBuild> {
  const settings = await readNotificationSettings();
  const fromEmail = (process.env.NOTIFICATION_FROM_EMAIL || "").trim();

  const [periods, allObjectives, allKrs] = await Promise.all([
    listPeriods(),
    listObjectives({}),
    listKeyResults({})
  ]);
  const periodMap = new Map(periods.map((p) => [p.periodKey, p]));
  const activePeriodKeys = new Set(periods.filter((p) => p.status === "Active").map((p) => p.periodKey));

  const aggregated = new Map<string, AggregatedReminder>();
  const entryFor = (email: string, ownerName?: string | null): AggregatedReminder => {
    let entry = aggregated.get(email);
    if (!entry) {
      entry = {
        ownerName: "",
        preDeadlineKrs: [],
        overdueCheckInKrs: [],
        atRiskObjectives: [],
        digestObjectives: [],
        digestKrs: []
      };
      aggregated.set(email, entry);
    }
    const trimmedName = (ownerName ?? "").trim();
    if (trimmedName && !entry.ownerName) {
      entry.ownerName = trimmedName;
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
      entryFor(email, kr.owner).preDeadlineKrs.push(kr);
      candidates.preDeadline++;
    }
  }

  if (settings.overdueCheckIn.enabled) {
    for (const kr of allKrs) {
      const period = periodMap.get(kr.periodKey);
      if (!period || !isMissingCheckin(kr.lastCheckinAt, period.status, now)) continue;
      const email = lowerEmail(kr.ownerEmail);
      if (!email) continue;
      entryFor(email, kr.owner).overdueCheckInKrs.push(kr);
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
      entryFor(email, obj.owner).atRiskObjectives.push(obj);
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
      entryFor(email, obj.owner).digestObjectives.push(obj);
      candidates.weeklyDigest++;
    }
    for (const kr of allKrs) {
      if (!activePeriodKeys.has(kr.periodKey)) continue;
      const email = lowerEmail(kr.ownerEmail);
      if (!email) continue;
      entryFor(email, kr.owner).digestKrs.push(kr);
    }
  }

  return { aggregated, candidates, fromEmail };
}

function summarizeReminder(reminder: AggregatedReminder): string {
  const parts: string[] = [];
  if (reminder.overdueCheckInKrs.length > 0) {
    parts.push(`${reminder.overdueCheckInKrs.length} overdue check-in${reminder.overdueCheckInKrs.length === 1 ? "" : "s"}`);
  }
  if (reminder.preDeadlineKrs.length > 0) {
    parts.push(`${reminder.preDeadlineKrs.length} upcoming deadline${reminder.preDeadlineKrs.length === 1 ? "" : "s"}`);
  }
  if (reminder.atRiskObjectives.length > 0) {
    parts.push(`${reminder.atRiskObjectives.length} at-risk objective${reminder.atRiskObjectives.length === 1 ? "" : "s"}`);
  }
  if (reminder.digestObjectives.length > 0 || reminder.digestKrs.length > 0) {
    parts.push("weekly digest");
  }
  return parts.join(", ") || "no items";
}

// Computes who would receive a reminder email and what each would contain,
// without sending anything. Powers the recipient-selection step in the UI.
export async function previewReminders(): Promise<ReminderPreviewResult> {
  const now = new Date();
  const { aggregated, candidates } = await buildAggregatedReminders(now);

  const recipients: ReminderRecipientPreview[] = [];
  for (const [email, reminder] of aggregated) {
    const hasContent =
      reminder.preDeadlineKrs.length > 0 ||
      reminder.overdueCheckInKrs.length > 0 ||
      reminder.atRiskObjectives.length > 0 ||
      reminder.digestObjectives.length > 0 ||
      reminder.digestKrs.length > 0;
    if (!email || !email.includes("@") || !hasContent) continue;

    recipients.push({
      email,
      name: reminder.ownerName || email,
      summary: summarizeReminder(reminder),
      preDeadline: reminder.preDeadlineKrs.length,
      overdueCheckIn: reminder.overdueCheckInKrs.length,
      atRisk: reminder.atRiskObjectives.length,
      digest: reminder.digestObjectives.length + reminder.digestKrs.length
    });
  }

  recipients.sort((a, b) => a.name.localeCompare(b.name));
  return { candidates, recipients };
}

// Computes and sends one aggregated email per owner. When `recipientFilter` is
// provided, only those email addresses are sent to. Shared by the daily cron
// (no filter = everyone) and the admin "Send Reminders" button (with selection).
export async function runReminders(recipientFilter?: string[]): Promise<ReminderRunResult> {
  const now = new Date();
  const { aggregated, candidates, fromEmail } = await buildAggregatedReminders(now);

  let toSend = aggregated;
  if (recipientFilter) {
    const allowed = new Set(recipientFilter.map((email) => lowerEmail(email)));
    toSend = new Map([...aggregated].filter(([email]) => allowed.has(email)));
  }

  let sendResult: SendRemindersResult | { error: string };
  try {
    sendResult = await sendAggregatedReminders(toSend, fromEmail);
  } catch (err) {
    sendResult = { error: err instanceof Error ? err.message : String(err) };
  }

  return {
    ranAt: now.toISOString(),
    candidates,
    recipients: toSend.size,
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
