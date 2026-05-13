import { requireAdmin } from "@/app/api/_utils/admin-guard";
import { readNotificationSettings, writeNotificationSettings } from "@/lib/notification-settings";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (guard) return guard;

  const settings = await readNotificationSettings();
  return NextResponse.json(settings);
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (guard) return guard;

  const body = (await request.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const updated = await writeNotificationSettings(body);
  return NextResponse.json(updated);
}
