import { readNotificationSettings } from "@/lib/notification-settings";
import { sendAggregatedReminders, type AggregatedReminder } from "@/lib/notifications";
import { isMissingCheckin } from "@/lib/okr-rules";
import { listKeyResults, listObjectives, listPeriods } from "@/lib/store";
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

  try {
    return await runScheduled();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Scheduled run failed: ${message}` }, { status: 200 });
  }
}

async function runScheduled(): Promise<NextResponse> {
  const now = new Date();
  const settings = await readNotificationSettings();

  const [periods, allObjectives, allKrs] = await Promise.all([
    listPeriods(),
    listObjectives({}),
    listKeyResults({})
  ]);
  const periodMap = new Map(periods.map((p) => [p.periodKey, p]));
  const activePeriodKeys = new Set(periods.filter((p) => p.status === "Active").map((p) => p.periodKey));

  // One aggregated entry per owner — all reminder types collapse into a single email.
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

  let sendResult;
  try {
    sendResult = await sendAggregatedReminders(aggregated);
  } catch (err) {
    sendResult = { error: err instanceof Error ? err.message : String(err) };
  }

  return NextResponse.json({
    ranAt: now.toISOString(),
    settings,
    candidates,
    recipients: aggregated.size,
    sendResult
  });
}
