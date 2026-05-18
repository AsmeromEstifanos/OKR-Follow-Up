import { getEnabledRuleIds, logReminderRun, rulesFiringAt, runReminders } from "@/lib/run-reminders";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const expected = process.env.SCHEDULER_SECRET ?? "";
  const provided = request.headers.get("x-scheduler-secret") ?? "";
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const now = new Date();
    const enabled = new Set(await getEnabledRuleIds());
    const firing = rulesFiringAt(enabled, now);

    if (firing.length === 0) {
      return NextResponse.json({ ranAt: now.toISOString(), rulesRun: [], skipped: "no rules match this window" });
    }

    const result = await runReminders(firing);
    await logReminderRun("scheduler", "/api/notifications/scheduled", result);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Scheduled run failed: ${message}` }, { status: 200 });
  }
}
