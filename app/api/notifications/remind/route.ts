import { requireAdmin } from "@/app/api/_utils/admin-guard";
import { logReminderRun, runReminders } from "@/lib/run-reminders";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeEmail(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guardResult = await requireAdmin(request);
  if (guardResult) {
    return guardResult;
  }

  try {
    const result = await runReminders();
    const adminEmail = normalizeEmail(request.headers.get("x-user-email"));
    await logReminderRun(adminEmail, "/api/notifications/remind", result);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Reminder run failed: ${message}` }, { status: 500 });
  }
}
