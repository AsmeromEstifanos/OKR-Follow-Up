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

// Last Mon-Fri of the given month (month is 0-indexed, JS Date convention).
export function lastWorkingDayOfMonth(year: number, month: number): number {
  const lastDay = new Date(year, month + 1, 0).getDate();
  for (let day = lastDay; day >= 1; day--) {
    const dow = new Date(year, month, day).getDay();
    if (dow !== 0 && dow !== 6) {
      return day;
    }
  }
  return lastDay;
}

// True if the rule's scheduled day matches `now` (Monday for weekly rule,
// dayOfMonth for monthly rule, etc.) — does not consider time-of-day.
export function ruleMatchesDay(rule: RuleDefinition, now: Date): boolean {
  switch (rule.schedule.kind) {
    case "weekly":
      return now.getDay() === rule.schedule.dayOfWeek;
    case "monthly":
      return now.getDate() === rule.schedule.dayOfMonth;
    case "lastWorkingDay":
      return now.getDate() === lastWorkingDayOfMonth(now.getFullYear(), now.getMonth());
    default:
      return false;
  }
}

// True if `now` falls within the rule's [hh:mm, hh:mm + windowMinutes) window
// AND the day matches. With a 15-min cron, the rule fires exactly once on its
// scheduled day in the first cron run after its scheduled time-of-day.
export function ruleMatchesNow(rule: RuleDefinition, now: Date, windowMinutes = 15): boolean {
  if (!ruleMatchesDay(rule, now)) return false;
  const minutesIntoDay = now.getHours() * 60 + now.getMinutes();
  const ruleMinutesIntoDay =
    "hour" in rule.schedule ? rule.schedule.hour * 60 + rule.schedule.minute : 0;
  return (
    minutesIntoDay >= ruleMinutesIntoDay &&
    minutesIntoDay < ruleMinutesIntoDay + windowMinutes
  );
}
