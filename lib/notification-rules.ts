export type RuleId =
  | "weeklyDigest"
  | "endOfWeekReflection"
  | "midMonthCheckpoint"
  | "thirdWeekFocus"
  | "monthEndReadiness";

export const RULE_IDS: RuleId[] = [
  "weeklyDigest",
  "endOfWeekReflection",
  "midMonthCheckpoint",
  "thirdWeekFocus",
  "monthEndReadiness"
];

export type RuleSchedule =
  | { kind: "weekly"; dayOfWeek: number; hour: number; minute: number }
  | { kind: "monthly"; dayOfMonth: number; hour: number; minute: number }
  | { kind: "lastWorkingDay"; hour: number; minute: number };

export type RuleDefinition = {
  id: RuleId;
  label: string;
  scheduleLabel: string;
  schedule: RuleSchedule;
  message: string;
  contentLabel: string;
};

export const RULE_DEFINITIONS: Record<RuleId, RuleDefinition> = {
  weeklyDigest: {
    id: "weeklyDigest",
    label: "Weekly OKR Digest",
    scheduleLabel: "Every Monday, 8:30 AM",
    schedule: { kind: "weekly", dayOfWeek: 1, hour: 8, minute: 30 },
    message: "Here is where your OKRs stand this week.",
    contentLabel: "Objective-level RAG, progress %, On Track / Needs Attention / At Risk"
  },
  endOfWeekReflection: {
    id: "endOfWeekReflection",
    label: "End-of-Week Reflection Reminder",
    scheduleLabel: "Every Friday, 3:30 PM",
    schedule: { kind: "weekly", dayOfWeek: 5, hour: 15, minute: 30 },
    message: "Please review progress, blockers, and priorities before next week.",
    contentLabel: "Objective-level RAG and KR progress %"
  },
  midMonthCheckpoint: {
    id: "midMonthCheckpoint",
    label: "Mid-Month Checkpoint",
    scheduleLabel: "15th of every month, 10:00 AM",
    schedule: { kind: "monthly", dayOfMonth: 15, hour: 10, minute: 0 },
    message: "Mid-month checkpoint: objectives requiring attention.",
    contentLabel: "Objective-level RAG and KR % (Red and Amber only)"
  },
  thirdWeekFocus: {
    id: "thirdWeekFocus",
    label: "Third-Week Focus Reminder",
    scheduleLabel: "22nd of every month, 9:00 AM",
    schedule: { kind: "monthly", dayOfMonth: 22, hour: 9, minute: 0 },
    message: "Please review and focus on objectives needing attention before month-end.",
    contentLabel: "Objectives with low progress, at-risk items"
  },
  monthEndReadiness: {
    id: "monthEndReadiness",
    label: "Month-End Readiness Reminder",
    scheduleLabel: "Last working day of the month, 11:00 AM",
    schedule: { kind: "lastWorkingDay", hour: 11, minute: 0 },
    message: "Please ensure all OKR statuses and updates are complete.",
    contentLabel: "Objective-level and KR-level % progress"
  }
};

// All schedule matching is done in the operations timezone (Africa/Addis_Ababa,
// GMT+3, no DST) so a rule set to "8:30 AM" actually fires at local 8:30 AM
// even though the cPanel server clock runs in UTC. Override with the
// NOTIFICATION_TIMEZONE_OFFSET env var (hours, can be negative or fractional).
function getTimezoneOffsetHours(): number {
  const raw = process.env.NOTIFICATION_TIMEZONE_OFFSET;
  if (!raw) return 3;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 3;
}

// Returns a Date whose UTC fields represent the wall-clock time in the
// configured timezone. Use the .getUTC* methods on the returned Date to read
// year/month/day/hour/minute as a human in that timezone would.
function toLocal(now: Date): Date {
  return new Date(now.getTime() + getTimezoneOffsetHours() * 60 * 60 * 1000);
}

// Last Mon-Fri of the given month (month is 0-indexed). Computed using UTC
// arithmetic to avoid picking up the server's local timezone.
export function lastWorkingDayOfMonth(year: number, month: number): number {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  for (let day = lastDay; day >= 1; day--) {
    const dow = new Date(Date.UTC(year, month, day)).getUTCDay();
    if (dow !== 0 && dow !== 6) {
      return day;
    }
  }
  return lastDay;
}

// True if the rule's scheduled day matches `now` in the operations timezone.
export function ruleMatchesDay(rule: RuleDefinition, now: Date): boolean {
  const local = toLocal(now);
  switch (rule.schedule.kind) {
    case "weekly":
      return local.getUTCDay() === rule.schedule.dayOfWeek;
    case "monthly":
      return local.getUTCDate() === rule.schedule.dayOfMonth;
    case "lastWorkingDay":
      return (
        local.getUTCDate() === lastWorkingDayOfMonth(local.getUTCFullYear(), local.getUTCMonth())
      );
    default:
      return false;
  }
}

// True if `now` falls within the rule's [hh:mm, hh:mm + windowMinutes) window
// AND the day matches — all evaluated in the operations timezone. With a
// 15-min cron, the rule fires exactly once on its scheduled day in the first
// cron run after its scheduled time-of-day.
export function ruleMatchesNow(rule: RuleDefinition, now: Date, windowMinutes = 15): boolean {
  if (!ruleMatchesDay(rule, now)) return false;
  const local = toLocal(now);
  const minutesIntoDay = local.getUTCHours() * 60 + local.getUTCMinutes();
  const ruleMinutesIntoDay =
    "hour" in rule.schedule ? rule.schedule.hour * 60 + rule.schedule.minute : 0;
  return (
    minutesIntoDay >= ruleMinutesIntoDay &&
    minutesIntoDay < ruleMinutesIntoDay + windowMinutes
  );
}
