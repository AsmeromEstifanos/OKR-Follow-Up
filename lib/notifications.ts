import type { KeyResult, Objective } from "@/lib/types";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

function getStorageConfig(): { tenantId: string; clientId: string; clientSecret: string; fromEmail: string } | null {
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
  const fromEmail = (process.env.NOTIFICATION_FROM_EMAIL ?? "").trim();

  if (!tenantId || !clientId || !clientSecret || !fromEmail) {
    return null;
  }

  return { tenantId, clientId, clientSecret, fromEmail };
}

async function acquireToken(config: { tenantId: string; clientId: string; clientSecret: string }): Promise<string> {
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
  // Temporary safety valve: when set, all reminder emails are redirected to a
  // single address so testing doesn't spam real owners. Remove the env var to go live.
  const testRecipient = (process.env.NOTIFICATION_TEST_RECIPIENT ?? "").trim();
  const actualRecipient = testRecipient || toEmail;
  const actualSubject = testRecipient ? `[TEST → ${toEmail}] ${subject}` : subject;

  const url = `${GRAPH_BASE_URL}/users/${encodeURIComponent(fromEmail)}/sendMail`;
  const payload = {
    message: {
      subject: actualSubject,
      body: { contentType: "HTML", content: htmlBody },
      toRecipients: [{ emailAddress: { address: actualRecipient } }]
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
    throw new Error(`Failed to send email to ${actualRecipient}: ${response.status} ${message}`);
  }
}

function buildMissingCheckInEmailHtml(ownerEmail: string, krs: KeyResult[]): string {
  const rows = krs
    .map(
      (kr) =>
        `<tr style="border-bottom:1px solid #e2e8f0">
          <td style="padding:8px 12px">${kr.title}</td>
          <td style="padding:8px 12px">${kr.krCode ?? kr.krKey}</td>
          <td style="padding:8px 12px">${kr.progressPct}%</td>
          <td style="padding:8px 12px">${kr.dueDate ?? "—"}</td>
        </tr>`
    )
    .join("");

  return `
<div style="font-family:'Trebuchet MS',sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f7f6ef;border-radius:12px">
  <h1 style="color:#183038;font-size:1.3rem;margin-bottom:4px">OKR Check-In Reminder</h1>
  <p style="color:#4f6770;margin-top:0">Hi ${ownerEmail.split("@")[0]}, the following key results are missing a check-in and need your attention:</p>
  <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px #0002">
    <thead>
      <tr style="background:#0f766e;color:#fff">
        <th style="padding:8px 12px;text-align:left">Key Result</th>
        <th style="padding:8px 12px;text-align:left">Code</th>
        <th style="padding:8px 12px;text-align:left">Progress</th>
        <th style="padding:8px 12px;text-align:left">Due Date</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="color:#4f6770;margin-top:16px;font-size:0.875rem">Please log in to the OKR Follow-Up system to record your updates. Regular check-ins help the team stay on track.</p>
</div>`;
}

function buildAtRiskEmailHtml(ownerEmail: string, objectives: Objective[]): string {
  const rows = objectives
    .map(
      (obj) =>
        `<tr style="border-bottom:1px solid #e2e8f0">
          <td style="padding:8px 12px">${obj.title}</td>
          <td style="padding:8px 12px">${obj.objectiveCode ?? obj.objectiveKey}</td>
          <td style="padding:8px 12px;color:#a55316;font-weight:700">${obj.rag}</td>
          <td style="padding:8px 12px">${obj.progressPct}%</td>
        </tr>`
    )
    .join("");

  return `
<div style="font-family:'Trebuchet MS',sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f7f6ef;border-radius:12px">
  <h1 style="color:#183038;font-size:1.3rem;margin-bottom:4px">At-Risk Objectives Alert</h1>
  <p style="color:#4f6770;margin-top:0">Hi ${ownerEmail.split("@")[0]}, the following objectives are at risk and need your attention:</p>
  <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px #0002">
    <thead>
      <tr style="background:#9a2d25;color:#fff">
        <th style="padding:8px 12px;text-align:left">Objective</th>
        <th style="padding:8px 12px;text-align:left">Code</th>
        <th style="padding:8px 12px;text-align:left">RAG</th>
        <th style="padding:8px 12px;text-align:left">Progress</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="color:#4f6770;margin-top:16px;font-size:0.875rem">Please review these objectives in the OKR Follow-Up system and update their status or add blockers as needed.</p>
</div>`;
}

export type SendRemindersResult = {
  emailsSent: number;
  skipped: number;
  errors: string[];
  notConfigured?: boolean;
};

export async function sendMissingCheckInReminders(
  grouped: Map<string, KeyResult[]>
): Promise<SendRemindersResult> {
  const config = getStorageConfig();
  if (!config) {
    return {
      emailsSent: 0,
      skipped: grouped.size,
      errors: [],
      notConfigured: true
    };
  }

  const token = await acquireToken(config);
  let emailsSent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [ownerEmail, krs] of grouped) {
    if (!ownerEmail || !ownerEmail.includes("@") || krs.length === 0) {
      skipped++;
      continue;
    }

    try {
      const html = buildMissingCheckInEmailHtml(ownerEmail, krs);
      await sendGraphEmail(
        token,
        config.fromEmail,
        ownerEmail,
        `Action needed: ${krs.length} OKR check-in${krs.length > 1 ? "s" : ""} overdue`,
        html
      );
      emailsSent++;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { emailsSent, skipped, errors };
}

export async function sendAtRiskAlerts(
  grouped: Map<string, Objective[]>
): Promise<SendRemindersResult> {
  const config = getStorageConfig();
  if (!config) {
    return {
      emailsSent: 0,
      skipped: grouped.size,
      errors: [],
      notConfigured: true
    };
  }

  const token = await acquireToken(config);
  let emailsSent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [ownerEmail, objectives] of grouped) {
    if (!ownerEmail || !ownerEmail.includes("@") || objectives.length === 0) {
      skipped++;
      continue;
    }

    try {
      const html = buildAtRiskEmailHtml(ownerEmail, objectives);
      await sendGraphEmail(
        token,
        config.fromEmail,
        ownerEmail,
        `Alert: ${objectives.length} at-risk OKR objective${objectives.length > 1 ? "s" : ""}`,
        html
      );
      emailsSent++;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { emailsSent, skipped, errors };
}

export type AggregatedReminder = {
  preDeadlineKrs: KeyResult[];
  overdueCheckInKrs: KeyResult[];
  atRiskObjectives: Objective[];
  digestObjectives: Objective[];
  digestKrs: KeyResult[];
};

const SECTION_HEADING = 'style="color:#183038;font-size:1.05rem;margin:22px 0 8px"';
const TABLE_OPEN =
  '<table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px #0002">';
const CELL = 'style="padding:8px 12px"';

function thRow(color: string, headers: string[]): string {
  const cells = headers
    .map((h) => `<th style="padding:8px 12px;text-align:left">${h}</th>`)
    .join("");
  return `<thead><tr style="background:${color};color:#fff">${cells}</tr></thead>`;
}

function overdueSection(krs: KeyResult[]): string {
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
  return `<h2 ${SECTION_HEADING}>Overdue check-ins (${krs.length})</h2>
  <p style="color:#4f6770;margin:0 0 8px;font-size:0.875rem">These key results are missing a check-in:</p>
  ${TABLE_OPEN}${thRow("#0f766e", ["Key Result", "Code", "Progress", "Due Date"])}<tbody>${rows}</tbody></table>`;
}

function preDeadlineSection(krs: KeyResult[]): string {
  if (krs.length === 0) return "";
  const rows = krs
    .map((kr) => {
      const daysLeft = kr.dueDate
        ? Math.max(0, Math.ceil((new Date(kr.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : "—";
      return `<tr style="border-bottom:1px solid #e2e8f0">
        <td ${CELL}>${kr.title}</td>
        <td ${CELL}>${kr.krCode ?? kr.krKey}</td>
        <td ${CELL}>${kr.progressPct}%</td>
        <td ${CELL}>${kr.dueDate ?? "—"}</td>
        <td style="padding:8px 12px;font-weight:700">${daysLeft}</td>
      </tr>`;
    })
    .join("");
  return `<h2 ${SECTION_HEADING}>Upcoming deadlines (${krs.length})</h2>
  <p style="color:#4f6770;margin:0 0 8px;font-size:0.875rem">These key results are due soon and below target:</p>
  ${TABLE_OPEN}${thRow("#a55316", ["Key Result", "Code", "Progress", "Due Date", "Days Left"])}<tbody>${rows}</tbody></table>`;
}

function atRiskSection(objectives: Objective[]): string {
  if (objectives.length === 0) return "";
  const rows = objectives
    .map(
      (obj) =>
        `<tr style="border-bottom:1px solid #e2e8f0">
          <td ${CELL}>${obj.title}</td>
          <td ${CELL}>${obj.objectiveCode ?? obj.objectiveKey}</td>
          <td style="padding:8px 12px;color:#a55316;font-weight:700">${obj.rag}</td>
          <td ${CELL}>${obj.progressPct}%</td>
        </tr>`
    )
    .join("");
  return `<h2 ${SECTION_HEADING}>At-risk objectives (${objectives.length})</h2>
  <p style="color:#4f6770;margin:0 0 8px;font-size:0.875rem">These objectives are rated Red or Amber:</p>
  ${TABLE_OPEN}${thRow("#9a2d25", ["Objective", "Code", "RAG", "Progress"])}<tbody>${rows}</tbody></table>`;
}

function digestSection(objectives: Objective[], krs: KeyResult[]): string {
  if (objectives.length === 0 && krs.length === 0) return "";
  const objRows = objectives
    .map(
      (obj) =>
        `<tr style="border-bottom:1px solid #e2e8f0">
          <td ${CELL}>${obj.title}</td>
          <td ${CELL}>${obj.objectiveCode ?? obj.objectiveKey}</td>
          <td ${CELL}>${obj.progressPct}%</td>
          <td style="padding:8px 12px;font-weight:700;color:${obj.rag === "Red" ? "#9a2d25" : obj.rag === "Amber" ? "#a55316" : "#1e6a3d"}">${obj.rag}</td>
        </tr>`
    )
    .join("");
  const krRows = krs
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
  const objTable =
    objectives.length > 0
      ? `<h3 style="color:#183038;font-size:0.95rem;margin:14px 0 6px">Your objectives (${objectives.length})</h3>
         ${TABLE_OPEN}${thRow("#0f766e", ["Title", "Code", "Progress", "RAG"])}<tbody>${objRows}</tbody></table>`
      : "";
  const krTable =
    krs.length > 0
      ? `<h3 style="color:#183038;font-size:0.95rem;margin:14px 0 6px">Your key results (${krs.length})</h3>
         ${TABLE_OPEN}${thRow("#0f766e", ["Title", "Code", "Progress", "Due"])}<tbody>${krRows}</tbody></table>`
      : "";
  return `<h2 ${SECTION_HEADING}>Weekly snapshot</h2>${objTable}${krTable}`;
}

function buildAggregatedEmail(
  ownerEmail: string,
  reminder: AggregatedReminder
): { subject: string; html: string } {
  const sections = [
    overdueSection(reminder.overdueCheckInKrs),
    preDeadlineSection(reminder.preDeadlineKrs),
    atRiskSection(reminder.atRiskObjectives),
    digestSection(reminder.digestObjectives, reminder.digestKrs)
  ]
    .filter(Boolean)
    .join("");

  const actionableCount =
    reminder.overdueCheckInKrs.length +
    reminder.preDeadlineKrs.length +
    reminder.atRiskObjectives.length;

  const subject =
    actionableCount > 0
      ? `Your OKR reminders — ${actionableCount} item${actionableCount === 1 ? "" : "s"} need attention`
      : "Your weekly OKR digest";

  const intro =
    actionableCount > 0
      ? "here is everything in your OKRs that needs attention right now."
      : "here is a snapshot of your OKRs this week.";

  const html = `
<div style="font-family:'Trebuchet MS',sans-serif;max-width:620px;margin:0 auto;padding:24px;background:#f7f6ef;border-radius:12px">
  <h1 style="color:#183038;font-size:1.3rem;margin-bottom:4px">OKR Follow-Up</h1>
  <p style="color:#4f6770;margin-top:0">Hi ${ownerEmail.split("@")[0]}, ${intro}</p>
  ${sections}
  <p style="color:#4f6770;margin-top:20px;font-size:0.875rem">Open the OKR Follow-Up system to update progress, check in, or flag blockers.</p>
</div>`;

  return { subject, html };
}

export async function sendAggregatedReminders(
  grouped: Map<string, AggregatedReminder>
): Promise<SendRemindersResult> {
  const config = getStorageConfig();
  if (!config) {
    return { emailsSent: 0, skipped: grouped.size, errors: [], notConfigured: true };
  }

  const token = await acquireToken(config);
  let emailsSent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [ownerEmail, reminder] of grouped) {
    const hasContent =
      reminder.preDeadlineKrs.length > 0 ||
      reminder.overdueCheckInKrs.length > 0 ||
      reminder.atRiskObjectives.length > 0 ||
      reminder.digestObjectives.length > 0 ||
      reminder.digestKrs.length > 0;

    if (!ownerEmail || !ownerEmail.includes("@") || !hasContent) {
      skipped++;
      continue;
    }

    try {
      const { subject, html } = buildAggregatedEmail(ownerEmail, reminder);
      await sendGraphEmail(token, config.fromEmail, ownerEmail, subject, html);
      emailsSent++;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { emailsSent, skipped, errors };
}
