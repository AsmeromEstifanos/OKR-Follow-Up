import type { KeyResult, Objective } from "@/lib/types";
import type { RuleId } from "@/lib/notification-rules";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

type GraphAppConfig = { tenantId: string; clientId: string; clientSecret: string };

function getGraphAppConfig(): GraphAppConfig | null {
  const tenantId = (
    process.env.AZURE_APP_TENANT_ID ??
    process.env.AZURE_TENANT_ID ??
    process.env.NEXT_PUBLIC_AAD_TENANT_ID ??
    ""
  ).trim();
  const clientId = (
    process.env.AZURE_APP_CLIENT_ID ??
    process.env.AZURE_CLIENT_ID ??
    process.env.NEXT_PUBLIC_AZURE_CLIENT_ID ??
    ""
  ).trim();
  const clientSecret = (
    process.env.AZURE_APP_CLIENT_SECRET ??
    process.env.AZURE_CLIENT_SECRET ??
    ""
  ).trim();

  if (!tenantId || !clientId || !clientSecret) {
    return null;
  }

  return { tenantId, clientId, clientSecret };
}

async function acquireToken(config: GraphAppConfig): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default"
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store"
  });

  if (!response.ok) {
    const message = await response.text();
    const clientIdHint = `${config.clientId.slice(0, 8)}…`;
    const secretLen = config.clientSecret.length;
    throw new Error(
      `Failed to acquire Graph token (clientId ${clientIdHint}, secret length ${secretLen}): ${response.status} ${message}`
    );
  }

  const json = (await response.json()) as { access_token: string };
  return json.access_token;
}

async function sendGraphEmail(
  token: string,
  fromEmail: string,
  toEmail: string,
  subject: string,
  htmlBody: string
): Promise<void> {
  const url = `${GRAPH_BASE_URL}/users/${encodeURIComponent(fromEmail)}/sendMail`;
  const payload = {
    message: {
      subject,
      body: { contentType: "HTML", content: htmlBody },
      toRecipients: [{ emailAddress: { address: toEmail } }]
    },
    saveToSentItems: false
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Failed to send email to ${toEmail}: ${response.status} ${message}`);
  }
}

export type SentEmailRecord = {
  recipient: string;
  subject: string;
};

export type SendRemindersResult = {
  emailsSent: number;
  skipped: number;
  errors: string[];
  notConfigured?: boolean;
  sentItems?: SentEmailRecord[];
};

// One section per rule that has content for a given owner. Each rule produces
// its own table layout — see the section builders below.
export type RuleSection = {
  ruleId: RuleId;
  ruleLabel: string;
  ruleMessage: string;
  objectives: Objective[];
  krs: KeyResult[];
};

export type AggregatedReminder = {
  ownerName: string;
  sections: RuleSection[];
};

const SECTION_HEADING = 'style="color:#183038;font-size:1.05rem;margin:22px 0 8px"';
const SECTION_INTRO = 'style="color:#4f6770;margin:0 0 8px;font-size:0.875rem"';
const TABLE_OPEN =
  '<table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px #0002">';
const CELL = 'style="padding:8px 12px"';

function thRow(color: string, headers: string[]): string {
  const cells = headers
    .map((h) => `<th style="padding:8px 12px;text-align:left">${h}</th>`)
    .join("");
  return `<thead><tr style="background:${color};color:#fff">${cells}</tr></thead>`;
}

function ragColor(rag: string): string {
  if (rag === "Red") return "#9a2d25";
  if (rag === "Amber") return "#a55316";
  return "#1e6a3d";
}

function statusLabel(obj: Objective): string {
  if (obj.rag === "Red") return "At Risk";
  if (obj.rag === "Amber") return "Needs Attention";
  return "On Track";
}

function objectivesProgressTable(objectives: Objective[], headerColor: string): string {
  if (objectives.length === 0) return "";
  const rows = objectives
    .map(
      (obj) =>
        `<tr style="border-bottom:1px solid #e2e8f0">
          <td ${CELL}>${obj.title}</td>
          <td ${CELL}>${obj.objectiveCode ?? obj.objectiveKey}</td>
          <td ${CELL}>${obj.progressPct}%</td>
          <td style="padding:8px 12px;font-weight:700;color:${ragColor(obj.rag)}">${obj.rag}</td>
          <td ${CELL}>${statusLabel(obj)}</td>
        </tr>`
    )
    .join("");
  return `${TABLE_OPEN}${thRow(headerColor, ["Objective", "Code", "Progress", "RAG", "Status"])}<tbody>${rows}</tbody></table>`;
}

function objectivesRagTable(objectives: Objective[], headerColor: string): string {
  if (objectives.length === 0) return "";
  const rows = objectives
    .map(
      (obj) =>
        `<tr style="border-bottom:1px solid #e2e8f0">
          <td ${CELL}>${obj.title}</td>
          <td ${CELL}>${obj.objectiveCode ?? obj.objectiveKey}</td>
          <td ${CELL}>${obj.progressPct}%</td>
          <td style="padding:8px 12px;font-weight:700;color:${ragColor(obj.rag)}">${obj.rag}</td>
        </tr>`
    )
    .join("");
  return `${TABLE_OPEN}${thRow(headerColor, ["Objective", "Code", "Progress", "RAG"])}<tbody>${rows}</tbody></table>`;
}

function krsProgressTable(krs: KeyResult[], headerColor: string): string {
  if (krs.length === 0) return "";
  const rows = krs
    .map(
      (kr) =>
        `<tr style="border-bottom:1px solid #e2e8f0">
          <td ${CELL}>${kr.title}</td>
          <td ${CELL}>${kr.krCode ?? kr.krKey}</td>
          <td ${CELL}>${kr.progressPct}%</td>
          <td ${CELL}>${kr.dueDate ?? "—"}</td>
        </tr>`
    )
    .join("");
  return `${TABLE_OPEN}${thRow(headerColor, ["Key Result", "Code", "Progress", "Due"])}<tbody>${rows}</tbody></table>`;
}

// Each rule renders differently based on the "What it shows" column from the
// notification settings table.
function renderSection(section: RuleSection): string {
  const heading = `<h2 ${SECTION_HEADING}>${section.ruleLabel}</h2>
  <p ${SECTION_INTRO}>${section.ruleMessage}</p>`;

  switch (section.ruleId) {
    case "weeklyDigest":
      return heading + objectivesProgressTable(section.objectives, "#0f766e");
    case "endOfWeekReflection":
      return (
        heading +
        objectivesRagTable(section.objectives, "#0f766e") +
        (section.krs.length > 0
          ? `<h3 style="color:#183038;font-size:0.95rem;margin:14px 0 6px">Your key results (${section.krs.length})</h3>` +
            krsProgressTable(section.krs, "#0f766e")
          : "")
      );
    case "midMonthCheckpoint":
      return (
        heading +
        objectivesRagTable(section.objectives, "#a55316") +
        (section.krs.length > 0
          ? `<h3 style="color:#183038;font-size:0.95rem;margin:14px 0 6px">Related key results (${section.krs.length})</h3>` +
            krsProgressTable(section.krs, "#a55316")
          : "")
      );
    case "thirdWeekFocus":
      return heading + objectivesProgressTable(section.objectives, "#9a2d25");
    case "monthEndReadiness":
      return (
        heading +
        objectivesRagTable(section.objectives, "#0f766e") +
        (section.krs.length > 0
          ? `<h3 style="color:#183038;font-size:0.95rem;margin:14px 0 6px">Key results (${section.krs.length})</h3>` +
            krsProgressTable(section.krs, "#0f766e")
          : "")
      );
    default:
      return heading;
  }
}

export function buildAggregatedEmail(
  ownerEmail: string,
  reminder: AggregatedReminder
): { subject: string; html: string } {
  const sectionsHtml = reminder.sections.map(renderSection).join("");

  const firstName = (reminder.ownerName.trim() || ownerEmail.split("@")[0]).split(/\s+/)[0];

  // Subject: if exactly one rule fired, use its label; otherwise summarise.
  const subject =
    reminder.sections.length === 1
      ? reminder.sections[0].ruleLabel
      : `OKR reminders — ${reminder.sections.length} update${reminder.sections.length === 1 ? "" : "s"}`;

  const intro =
    reminder.sections.length === 1
      ? reminder.sections[0].ruleMessage
      : "here are the OKR updates that apply to you right now.";

  const html = `
<div style="font-family:'Trebuchet MS',sans-serif;max-width:620px;margin:0 auto;padding:24px;background:#f7f6ef;border-radius:12px">
  <h1 style="color:#183038;font-size:1.3rem;margin-bottom:4px">OKR Follow-Up</h1>
  <p style="color:#4f6770;margin-top:0">Hi ${firstName}, ${intro}</p>
  ${sectionsHtml}
  <p style="color:#4f6770;margin-top:20px;font-size:0.875rem">Open the OKR Follow-Up system to update progress, check in, or flag blockers.</p>
</div>`;

  return { subject, html };
}

// Sends one aggregated reminder email per owner, from `fromEmail` (a mailbox in
// the tenant configured through NOTIFICATION_FROM_EMAIL). Returns notConfigured
// when the Graph app credentials or sender mailbox are missing.
export type MentionNotificationParams = {
  mentionedEmails: string[];
  authorEmail: string;
  authorName: string;
  messageBody: string;
  entityType: string;
  entityKey: string;
  entityTitle: string;
};

// Sends a mention notification email to each mentioned user.
// Uses NOTIFICATION_FROM_EMAIL as the sender (same as reminder emails).
// Silently no-ops if Graph credentials or sender email are not configured.
export async function sendMentionNotifications(params: MentionNotificationParams): Promise<void> {
  const config = getGraphAppConfig();
  const fromEmail = (process.env.NOTIFICATION_FROM_EMAIL ?? "").trim();
  if (!config || !fromEmail) return;

  const token = await acquireToken(config);
  const { mentionedEmails, authorName, authorEmail, messageBody, entityType, entityKey, entityTitle } = params;

  const entityLabel = entityType === "kr" ? "Key Result" : "Objective";
  const chatUrl = `${process.env.NEXT_PUBLIC_REDIRECT_URI ?? ""}/?openChat=${encodeURIComponent(`${entityType}::${entityKey}`)}`;
  const senderLabel = authorName || authorEmail.split("@")[0];

  const subject = `${senderLabel} mentioned you in a discussion`;
  const html = `
<div style="font-family:'Trebuchet MS',sans-serif;max-width:580px;margin:0 auto;padding:24px;background:#f7f6ef;border-radius:12px">
  <h1 style="color:#183038;font-size:1.2rem;margin-bottom:4px">OKR Follow-Up</h1>
  <p style="color:#4f6770;margin-top:0"><strong>${escapeHtml(senderLabel)}</strong> mentioned you in a discussion.</p>
  <div style="background:#fff;border-radius:8px;padding:14px 18px;margin:16px 0;border-left:4px solid #0f766e">
    <div style="color:#4f6770;font-size:0.8rem;margin-bottom:4px">${escapeHtml(entityLabel)}: ${escapeHtml(entityTitle || entityKey)}</div>
    <p style="color:#183038;margin:0;white-space:pre-wrap">${escapeHtml(messageBody)}</p>
  </div>
  <a href="${chatUrl}" style="display:inline-block;background:#0f766e;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:0.9rem">Open discussion</a>
  <p style="color:#4f6770;margin-top:20px;font-size:0.8rem">You received this because you were mentioned. Reply directly in OKR Follow-Up.</p>
</div>`;

  await Promise.allSettled(
    mentionedEmails.map((email) => sendGraphEmail(token, fromEmail, email, subject, html))
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendAggregatedReminders(
  grouped: Map<string, AggregatedReminder>,
  fromEmail: string
): Promise<SendRemindersResult> {
  const config = getGraphAppConfig();
  const sender = (fromEmail ?? "").trim();
  if (!config || !sender) {
    return { emailsSent: 0, skipped: grouped.size, errors: [], notConfigured: true };
  }

  const token = await acquireToken(config);
  let emailsSent = 0;
  let skipped = 0;
  const errors: string[] = [];
  const sentItems: SentEmailRecord[] = [];

  for (const [ownerEmail, reminder] of grouped) {
    const hasContent = reminder.sections.length > 0;
    if (!ownerEmail || !ownerEmail.includes("@") || !hasContent) {
      skipped++;
      continue;
    }

    try {
      const { subject, html } = buildAggregatedEmail(ownerEmail, reminder);
      await sendGraphEmail(token, sender, ownerEmail, subject, html);
      emailsSent++;
      sentItems.push({ recipient: ownerEmail, subject });
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { emailsSent, skipped, errors, sentItems };
}
