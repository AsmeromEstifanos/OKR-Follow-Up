import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

function getAppConfig(): { tenantId: string; clientId: string; clientSecret: string } | null {
  const tenantId =
    process.env.AZURE_APP_TENANT_ID ??
    process.env.AZURE_TENANT_ID ??
    process.env.NEXT_PUBLIC_AAD_TENANT_ID ??
    "";
  const clientId =
    process.env.AZURE_APP_CLIENT_ID ??
    process.env.AZURE_CLIENT_ID ??
    process.env.NEXT_PUBLIC_AZURE_CLIENT_ID ??
    "";
  const clientSecret =
    process.env.AZURE_APP_CLIENT_SECRET ?? process.env.AZURE_CLIENT_SECRET ?? "";

  if (!tenantId || !clientId || !clientSecret) return null;
  return { tenantId, clientId, clientSecret };
}

async function acquireAppToken(config: {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default"
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store"
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to acquire token: ${res.status}`);
  }

  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

function buildEmailHtml(senderName: string, body: string): string {
  const paragraphs = body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<p style="margin:0 0 12px;color:#2d4a52;font-size:0.95rem;line-height:1.6">${l}</p>`)
    .join("");

  return `<div style="font-family:'Trebuchet MS',sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f7f6ef;border-radius:12px">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
    <div style="width:40px;height:40px;border-radius:50%;background:#183038;display:flex;align-items:center;justify-content:center;font-size:1.2rem">📊</div>
    <div>
      <div style="font-size:1.1rem;font-weight:700;color:#183038">OKR Follow-Up</div>
      <div style="font-size:0.8rem;color:#4f6770">Automated reminder</div>
    </div>
  </div>
  <div style="background:#fff;border-radius:8px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.08)">
    ${paragraphs}
  </div>
  <p style="color:#8a9ba2;margin-top:16px;font-size:0.78rem;text-align:center">
    Sent on behalf of ${senderName} via OKR Follow-Up System
  </p>
</div>`;
}

type Recipient = { name: string; email: string };
type RequestBody = {
  senderEmail?: string;
  senderName?: string;
  recipients?: Recipient[];
  subject?: string;
  body?: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const config = getAppConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Email service is not configured on this server." },
      { status: 503 }
    );
  }

  const data = (await request.json()) as RequestBody;
  const { senderEmail, senderName, recipients, subject, body } = data;

  if (!senderEmail || !recipients?.length || !subject || !body) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  let token: string;
  try {
    token = await acquireAppToken(config);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Auth failed." },
      { status: 502 }
    );
  }

  const html = buildEmailHtml(senderName ?? senderEmail, body);
  let sent = 0;
  const errors: string[] = [];

  for (const recipient of recipients) {
    if (!recipient.email?.includes("@")) continue;
    try {
      const res = await fetch(
        `${GRAPH_BASE_URL}/users/${encodeURIComponent(senderEmail)}/sendMail`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            message: {
              subject,
              body: { contentType: "HTML", content: html },
              toRecipients: [
                { emailAddress: { address: recipient.email, name: recipient.name } }
              ]
            },
            saveToSentItems: true
          }),
          cache: "no-store"
        }
      );

      if (!res.ok) {
        const msg = await res.text();
        errors.push(`${recipient.email}: ${res.status} ${msg.slice(0, 120)}`);
      } else {
        sent++;
      }
    } catch (err) {
      errors.push(`${recipient.email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({ sent, errors });
}
