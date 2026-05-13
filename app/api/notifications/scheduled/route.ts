import { readNotificationSettings } from "@/lib/notification-settings";
import {
  sendAtRiskAlerts,
  sendMissingCheckInReminders,
  sendPreDeadlineReminders,
  sendWeeklyDigest,
  type SendRemindersResult
} from "@/lib/notifications";
import { isMissingCheckin } from "@/lib/okr-rules";
import { listKeyResults, listObjectives, listPeriods } from "@/lib/store";
import type { KeyResult, Objective } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

function daysUntil(dueDate: string | null | undefined, now: Date): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate).getTime();
  if (!Number.isFinite(due)) return null;
  return Math.ceil((due - now.getTime()) / (1000 * 60 * 60 * 24));
}

function lowerEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const expected = process.env.SCHEDULER_SECRET ?? "";
  const provided = request.headers.get("x-scheduler-secret") ?? "";
  if (!expected || provided !== expected) {
    return unauthorized();
  }

  const now = new Date();
  const settings = await readNotificationSettings();

  const [periods, allObjectives, allKrs] = await Promise.all([
    listPeriods(),
    listObjectives({}),
    listKeyResults({})
  ]);
  const periodMap = new Map(periods.map((p) => [p.periodKey, p]));
  const activePeriodKeys = new Set(periods.filter((p) => p.status === "Active").map((p) => p.periodKey));

  const results: Record<string, SendRemindersResult | { skipped: true }> = {};

  if (settings.preDeadline.enabled) {
    const grouped = new Map<string, KeyResult[]>();
    for (const kr of allKrs) {
      if (!activePeriodKeys.has(kr.periodKey)) continue;
      if (kr.progressPct >= settings.preDeadline.progressThreshold) continue;
      const days = daysUntil(kr.dueDate, now);
      if (days === null || days < 0 || days > settings.preDeadline.daysBefore) continue;
      const email = lowerEmail(kr.ownerEmail);
      if (!email) continue;
      const list = grouped.get(email) ?? [];
      list.push(kr);
      grouped.set(email, list);
    }
    results.preDeadline = await sendPreDeadlineReminders(grouped, settings.preDeadline.daysBefore);
  } else {
    results.preDeadline = { skipped: true };
  }

  if (settings.overdueCheckIn.enabled) {
    const missing = allKrs.filter((kr) => {
      const period = periodMap.get(kr.periodKey);
      return period ? isMissingCheckin(kr.lastCheckinAt, period.status, now) : false;
    });
    const grouped = new Map<string, KeyResult[]>();
    for (const kr of missing) {
      const email = lowerEmail(kr.ownerEmail);
      if (!email) continue;
      const list = grouped.get(email) ?? [];
      list.push(kr);
      grouped.set(email, list);
    }
    results.overdueCheckIn = await sendMissingCheckInReminders(grouped);
  } else {
    results.overdueCheckIn = { skipped: true };
  }

  if (settings.atRiskAlert.enabled) {
    const atRisk = allObjectives.filter((obj) => {
      const period = periodMap.get(obj.periodKey);
      return period?.status === "Active" && (obj.rag === "Red" || obj.rag === "Amber");
    });
    const grouped = new Map<string, Objective[]>();
    for (const obj of atRisk) {
      const email = lowerEmail(obj.ownerEmail);
      if (!email) continue;
      const list = grouped.get(email) ?? [];
      list.push(obj);
      grouped.set(email, list);
    }
    results.atRiskAlert = await sendAtRiskAlerts(grouped);
  } else {
    results.atRiskAlert = { skipped: true };
  }

  if (settings.weeklyDigest.enabled && now.getDay() === settings.weeklyDigest.dayOfWeek) {
    const grouped = new Map<string, { objectives: Objective[]; krs: KeyResult[] }>();
    for (const obj of allObjectives) {
      if (!activePeriodKeys.has(obj.periodKey)) continue;
      const email = lowerEmail(obj.ownerEmail);
      if (!email) continue;
      const entry = grouped.get(email) ?? { objectives: [], krs: [] };
      entry.objectives.push(obj);
      grouped.set(email, entry);
    }
    for (const kr of allKrs) {
      if (!activePeriodKeys.has(kr.periodKey)) continue;
      const email = lowerEmail(kr.ownerEmail);
      if (!email) continue;
      const entry = grouped.get(email) ?? { objectives: [], krs: [] };
      entry.krs.push(kr);
      grouped.set(email, entry);
    }
    results.weeklyDigest = await sendWeeklyDigest(grouped);
  } else {
    results.weeklyDigest = { skipped: true };
  }

  return NextResponse.json({ ranAt: now.toISOString(), settings, results });
}
