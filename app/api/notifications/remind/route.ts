import { requireAdmin } from "@/app/api/_utils/admin-guard";
import {
  getEnabledRuleIds,
  logReminderRun,
  previewReminders,
  runReminders
} from "@/lib/run-reminders";
import { RULE_IDS, RULE_DEFINITIONS } from "@/lib/notification-rules";
import type { RuleId } from "@/lib/notification-rules";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeEmail(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function filterToEnabledRuleIds(requested: unknown[], enabled: RuleId[]): RuleId[] {
  const enabledSet = new Set(enabled);
  return requested
    .filter((id): id is RuleId => typeof id === "string" && RULE_IDS.includes(id as RuleId) && enabledSet.has(id as RuleId));
}

// Preview: returns enabled rule metadata + who would receive which rules.
// Accepts optional ?ruleIds=weeklyDigest,endOfWeekReflection to limit scope.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const guardResult = await requireAdmin(request);
  if (guardResult) return guardResult;

  try {
    const enabled = await getEnabledRuleIds();
    const requestedParam = request.nextUrl.searchParams.get("ruleIds");
    const rulesToPreview: RuleId[] = requestedParam
      ? filterToEnabledRuleIds(requestedParam.split(",").map((s) => s.trim()), enabled)
      : enabled;

    const preview = await previewReminders(rulesToPreview);

    // Also return the full menu of enabled rules with labels/schedules for the UI
    const ruleMenu = enabled.map((id) => ({
      id,
      label: RULE_DEFINITIONS[id].label,
      scheduleLabel: RULE_DEFINITIONS[id].scheduleLabel
    }));

    return NextResponse.json({ ...preview, ruleMenu });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Reminder preview failed: ${message}` }, { status: 500 });
  }
}

// Send: dispatches reminders for the selected rules (subset of enabled).
// Body: { ruleIds?: string[]; recipients?: string[] }
export async function POST(request: NextRequest): Promise<NextResponse> {
  const guardResult = await requireAdmin(request);
  if (guardResult) return guardResult;

  try {
    const body = (await request.json().catch(() => null)) as { recipients?: unknown; ruleIds?: unknown } | null;

    const enabled = await getEnabledRuleIds();

    const rulesToRun: RuleId[] = Array.isArray(body?.ruleIds) && (body!.ruleIds as unknown[]).length > 0
      ? filterToEnabledRuleIds(body!.ruleIds as unknown[], enabled)
      : enabled;

    if (rulesToRun.length === 0) {
      return NextResponse.json({ error: "No valid enabled rules selected." }, { status: 400 });
    }

    const recipientFilter = Array.isArray(body?.recipients)
      ? (body!.recipients as unknown[]).filter((entry): entry is string => typeof entry === "string")
      : undefined;

    const result = await runReminders(rulesToRun, recipientFilter);
    const adminEmail = normalizeEmail(request.headers.get("x-user-email"));
    await logReminderRun(adminEmail, "/api/notifications/remind", result);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Reminder run failed: ${message}` }, { status: 500 });
  }
}
