import { requireAdmin } from "@/app/api/_utils/admin-guard";
import { logReminderRun, previewReminders, runReminders } from "@/lib/run-reminders";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeEmail(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

// Preview: who would receive a reminder and what each email would contain.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const guardResult = await requireAdmin(request);
  if (guardResult) {
    return guardResult;
  }

  try {
    const preview = await previewReminders();
    return NextResponse.json(preview);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Reminder preview failed: ${message}` }, { status: 500 });
  }
}

// Send: dispatches reminder emails. An optional { recipients: string[] } body
// limits the send to the selected addresses; omit it to send to everyone.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const guardResult = await requireAdmin(request);
  if (guardResult) {
    return guardResult;
  }

  try {
    const body = (await request.json().catch(() => null)) as { recipients?: unknown } | null;
    const recipientFilter = Array.isArray(body?.recipients)
      ? (body!.recipients as unknown[]).filter((entry): entry is string => typeof entry === "string")
      : undefined;

    const result = await runReminders(recipientFilter);
    const adminEmail = normalizeEmail(request.headers.get("x-user-email"));
    await logReminderRun(adminEmail, "/api/notifications/remind", result);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Reminder run failed: ${message}` }, { status: 500 });
  }
}
