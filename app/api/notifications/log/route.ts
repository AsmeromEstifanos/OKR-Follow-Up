import { requireAdmin } from "@/app/api/_utils/admin-guard";
import { getActivityLogEntries } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SentItem = { recipient: string; subject: string };

type ReminderLogEntry = {
  occurredAt: string;
  triggeredBy: string;
  emailsSent: number;
  errorCount: number;
  recipients: number;
  sentItems: SentItem[];
};

function parseEntry(detailsJson: string): {
  emailsSent: number;
  errorCount: number;
  recipients: number;
  sentItems: SentItem[];
} {
  try {
    const parsed = JSON.parse(detailsJson) as {
      recipients?: number;
      sendResult?: {
        emailsSent?: number;
        errors?: string[];
        sentItems?: SentItem[];
      };
    };
    const send = parsed.sendResult ?? {};
    return {
      emailsSent: send.emailsSent ?? 0,
      errorCount: send.errors?.length ?? 0,
      recipients: parsed.recipients ?? 0,
      sentItems: Array.isArray(send.sentItems) ? send.sentItems : []
    };
  } catch {
    return { emailsSent: 0, errorCount: 0, recipients: 0, sentItems: [] };
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (guard) return guard;

  const entries = await getActivityLogEntries("notification", 25);
  const log: ReminderLogEntry[] = entries.map((entry) => {
    const details = parseEntry(entry.detailsJson ?? "");
    return {
      occurredAt: entry.occurredAt,
      triggeredBy: entry.userEmail,
      emailsSent: details.emailsSent,
      errorCount: details.errorCount,
      recipients: details.recipients,
      sentItems: details.sentItems
    };
  });

  return NextResponse.json({ log });
}
