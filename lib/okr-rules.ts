import type { KeyResult, Milestone, PeriodStatus } from "@/lib/types";

const MISSING_CHECKIN_DAYS = 7;

export function clampPercent(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 100) {
    return 100;
  }

  return Number(value.toFixed(2));
}

export function computeKrProgress(baselineValue: number, targetValue: number, currentValue: number): number {
  if (targetValue === baselineValue) {
    return currentValue >= targetValue ? 100 : 0;
  }

  return clampPercent(((currentValue - baselineValue) / (targetValue - baselineValue)) * 100);
}

export function computeObjectiveProgress(keyResults: Pick<KeyResult, "progressPct">[]): number {
  if (keyResults.length === 0) {
    return 0;
  }

  const total = keyResults.reduce((sum, kr) => sum + kr.progressPct, 0);
  return clampPercent(total / keyResults.length);
}

export function computeMilestoneProgress(milestones: Pick<Milestone, "weight" | "progressPct">[]): number {
  if (milestones.length === 0) {
    return 0;
  }

  const totalWeight = milestones.reduce((sum, milestone) => sum + Math.max(0, milestone.weight), 0);
  if (totalWeight <= 0) {
    return 0;
  }

  const weightedProgress = milestones.reduce((sum, milestone) => {
    return sum + Math.max(0, milestone.weight) * clampPercent(milestone.progressPct);
  }, 0);

  return clampPercent(weightedProgress / totalWeight);
}

export function isMissingCheckin(
  lastCheckinAt: string | null,
  periodStatus: PeriodStatus,
  now: Date = new Date()
): boolean {
  if (periodStatus !== "Active") {
    return false;
  }

  if (!lastCheckinAt) {
    return true;
  }

  const last = new Date(lastCheckinAt).getTime();
  const elapsedDays = (now.getTime() - last) / (1000 * 60 * 60 * 24);
  return elapsedDays > MISSING_CHECKIN_DAYS;
}
