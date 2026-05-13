import { listCheckIns, listKeyResults, listMilestones, listObjectives, listPeriods } from "@/lib/store";
import type { CheckIn, KeyResult, Milestone, Objective, Period } from "@/lib/types";
import { NextRequest } from "next/server";
import OpenAI from "openai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ChatMessage = { role: "user" | "assistant"; content: string };
type RequestBody = { messages?: ChatMessage[]; userEmail?: string; userName?: string };

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function buildOkrContext(
  periods: Period[],
  objectives: Objective[],
  keyResults: KeyResult[],
  checkIns: CheckIn[],
  milestones: Milestone[]
): string {
  const activePeriods = periods.filter((p) => p.status === "Active");
  const activePeriodKeys = new Set(activePeriods.map((p) => p.periodKey));

  const latestCheckIn = new Map<string, CheckIn>();
  for (const ci of checkIns) {
    const existing = latestCheckIn.get(ci.krKey);
    if (!existing || ci.checkInAt > existing.checkInAt) {
      latestCheckIn.set(ci.krKey, ci);
    }
  }

  const krByObjective = new Map<string, KeyResult[]>();
  for (const kr of keyResults) {
    const list = krByObjective.get(kr.objectiveKey) ?? [];
    list.push(kr);
    krByObjective.set(kr.objectiveKey, list);
  }

  const milestonesByKr = new Map<string, Milestone[]>();
  for (const m of milestones) {
    const list = milestonesByKr.get(m.krKey) ?? [];
    list.push(m);
    milestonesByKr.set(m.krKey, list);
  }

  const activeObjectives = objectives.filter((o) => activePeriodKeys.has(o.periodKey));

  const lines: string[] = [];

  lines.push("=== ACTIVE PERIODS ===");
  for (const p of activePeriods) {
    lines.push(`• ${p.name} (${p.startDate} → ${p.endDate})`);
  }

  lines.push("\n=== OBJECTIVES & KEY RESULTS ===");

  const byDept = new Map<string, Objective[]>();
  for (const obj of activeObjectives) {
    const key = `${obj.ventureName ?? "General"} / ${obj.department}`;
    const list = byDept.get(key) ?? [];
    list.push(obj);
    byDept.set(key, list);
  }

  for (const [deptLabel, objs] of byDept) {
    lines.push(`\n[${deptLabel}]`);
    for (const obj of objs) {
      lines.push(`  OBJECTIVE: ${obj.objectiveCode ?? obj.objectiveKey} — "${obj.title}"`);
      lines.push(
        `    Progress: ${obj.progressPct}% | RAG: ${obj.rag} | Status: ${obj.status} | Confidence: ${obj.confidence} | Owner: ${obj.ownerEmail ?? obj.owner ?? "unassigned"}`
      );
      if (obj.blockers) lines.push(`    Blockers: ${obj.blockers}`);
      if (obj.notes) lines.push(`    Notes: ${obj.notes}`);

      const krs = krByObjective.get(obj.objectiveKey) ?? [];
      for (const kr of krs) {
        const latest = latestCheckIn.get(kr.krKey);
        lines.push(`    KR: ${kr.krCode ?? kr.krKey} — "${kr.title}"`);
        lines.push(
          `      Progress: ${kr.progressPct}% (${kr.currentValue}/${kr.targetValue} ${kr.metricType}) | Status: ${kr.status} | Due: ${kr.dueDate ?? "—"} | Owner: ${kr.ownerEmail ?? kr.owner ?? "unassigned"}`
        );
        if (kr.blockers) lines.push(`      Blockers: ${kr.blockers}`);
        if (kr.supportNeeded) lines.push(`      Support needed: ${kr.supportNeeded}`);
        if (latest) {
          lines.push(`      Last check-in (${latest.checkInAt.slice(0, 10)}): ${latest.updateNotes || "(no notes)"}`);
          if (latest.blockers) lines.push(`      Check-in blockers: ${latest.blockers}`);
        } else {
          lines.push(`      Last check-in: NONE — overdue`);
        }

        const krmilestones = milestonesByKr.get(kr.krKey) ?? [];
        for (const m of krmilestones) {
          lines.push(`      Milestone: "${m.title}" — Progress: ${m.progressPct}% | Weight: ${m.weight}`);
        }
      }
    }
  }

  const totalObjs = activeObjectives.length;
  const green = activeObjectives.filter((o) => o.rag === "Green").length;
  const amber = activeObjectives.filter((o) => o.rag === "Amber").length;
  const red = activeObjectives.filter((o) => o.rag === "Red").length;
  const avgProgress = totalObjs
    ? Math.round(activeObjectives.reduce((s, o) => s + o.progressPct, 0) / totalObjs)
    : 0;
  const missingCheckIns = keyResults.filter(
    (kr) => activePeriodKeys.has(kr.periodKey) && !latestCheckIn.has(kr.krKey)
  ).length;

  lines.push("\n=== SUMMARY STATS ===");
  lines.push(`Total active objectives: ${totalObjs}`);
  lines.push(`RAG breakdown: ${green} Green / ${amber} Amber / ${red} Red`);
  lines.push(`Average progress: ${avgProgress}%`);
  lines.push(`KRs missing any check-in: ${missingCheckIns}`);

  return lines.join("\n");
}

function buildSystemPrompt(userEmail: string | undefined, userName: string | undefined): string {
  let userLine: string;
  if (userName && userEmail) {
    userLine = `The user you are speaking with is ${userName} (${userEmail}). When they say "I", "me", or "my", refer to their data in the OKR context above. You may address them by their first name.`;
  } else if (userEmail) {
    userLine = `The user you are speaking with is signed in as: ${userEmail}. When they say "I", "me", or "my", refer to their data in the OKR context above.`;
  } else {
    userLine = "The signed-in user is unknown.";
  }

  return `You are an OKR assistant embedded in an OKR tracking system. You have been given the complete, live OKR data for the organisation below, including objectives, key results, milestones, check-ins, and team members.

Your job is to help team members understand anything that can be derived from the OKR data — including objectives, key results, milestones, progress, check-ins, blockers, owners, positions, departments, ventures, timelines, and team performance. You can also prepare reminder email drafts that open in the user's Outlook ready to review and send.

${userLine}

RULES:
1. Answer any question that can be answered using the data provided — this includes questions about people (their roles, positions, owned objectives/KRs/milestones, progress), departments, ventures, and any other information present in the data.
2. Only decline if the question is entirely unrelated to the organisation's OKR data and cannot be answered from it (e.g. personal advice, general coding help, topics with no connection to the data). In that case politely redirect: "I can only help with questions related to the OKR data."
3. Base your answers strictly on the data provided. Do not invent data.
4. ALWAYS default to short, high-level summaries. When asked to "list OKRs" or similar, output ONLY objective titles (one bullet per objective, grouped by venture/department). Do NOT include KRs, milestones, progress percentages, notes, blockers, or check-ins unless the user explicitly asks for them.
5. Only expand into full detail when the user explicitly says "elaborate", "show details", "include KRs", "give me everything", or asks for a specific field (e.g. "what's the progress?").
6. Use bullet points where helpful. Keep responses tight — a few lines is better than a page.
7. Format your response in a markdown table when the data is comparative or tabular by nature — for example, when listing multiple items with the same fields (e.g. several objectives with progress + RAG + owner, several departments with stats, KRs with progress + due date, side-by-side comparisons). Default to a table in those cases without being asked. Keep tables to the columns the user needs; do not add columns just to fill space. Use plain bullets or prose when the data is a simple list or a single item.
8. If information is missing or unclear from the data, say so honestly.

INTERACTIVE OPTIONS (MANDATORY):
You MUST append an [OPTIONS] block at the END of any response that asks the user a question with a small set of concrete answers. This is not optional — if your message ends with a question that has anticipated answers, the [OPTIONS] block is REQUIRED. The UI renders these as clickable buttons.

Format (place on its own line at the very end of your message — nothing after it):
[OPTIONS]Option one|Option two|Option three[/OPTIONS]

Rules:
- Each option: a short (2-8 words) phrase representing exactly what the user would type as a reply.
- Use 2-4 options. The first option is the most likely / recommended choice.
- Apply this to confirmations, yes/no, format choices, drill-downs, follow-ups, "would you like…?" questions, "shall I…?" prompts.
- Examples (ALWAYS include the [OPTIONS] block when asking these):
  • "Would you like a summary or full details?" → ends with [OPTIONS]Summary|Full details[/OPTIONS]
  • "Draft a custom message or use a standard reminder?" → ends with [OPTIONS]Draft a custom message|Use a standard reminder[/OPTIONS]
  • "Ready to send?" → ends with [OPTIONS]Yes, open in Outlook|Let me edit it first|Cancel[/OPTIONS]
  • "Want me to show this in a table?" → ends with [OPTIONS]Yes, show table|Keep current format[/OPTIONS]
- Only skip [OPTIONS] for truly open-ended questions (e.g. "What would you like to know?").
- Never combine [OPTIONS] with [SEND_EMAILS] in the same message.

EMAIL ACTIONS:
When the user asks you to email, remind, or notify people about their OKRs:
1. Immediately use the OKR data to identify the relevant recipients (e.g. people with overdue check-ins, at-risk objectives, missing updates) and draft a clear, professional email on the spot. Do not ask "custom or standard?" first — just draft one.
2. Show the user the draft: recipient list, subject, and full body. Then ask if they'd like to send it as-is or make changes, and end with an [OPTIONS] block, e.g.:
   [OPTIONS]Open in Outlook|Edit the message|Cancel[/OPTIONS]
3. Only after the user explicitly confirms (e.g. "looks good", "send it", "open it", "yes, open in Outlook"), output ONLY the following block — no prose before or after, no "click Open in Outlook" instruction, nothing else:
[SEND_EMAILS]{"recipients":[{"name":"Full Name","email":"email@example.com"}],"subject":"Subject here","body":"Plain text body. Use \\n for line breaks."}[/SEND_EMAILS]
4. Never include the [SEND_EMAILS] block before the user confirms. Show the draft first.
5. The block triggers an "Open in Outlook" button in the UI — the user clicks it themselves. Do not narrate this; the button is self-explanatory.
6. The "body" field must be plain text (no HTML). Keep it professional, warm, and concise.`;
}

const CONTEXT_TTL_MS = 10 * 60 * 1000;
let contextCache: { text: string; builtAt: number } | null = null;

async function getCachedOkrContext(): Promise<string> {
  const now = Date.now();
  if (contextCache && now - contextCache.builtAt < CONTEXT_TTL_MS) {
    return contextCache.text;
  }

  const [periods, objectives, keyResults, checkIns, milestones] = await Promise.all([
    listPeriods(),
    listObjectives({}),
    listKeyResults({}),
    listCheckIns({}),
    listMilestones({})
  ]);

  const text = buildOkrContext(periods, objectives, keyResults, checkIns, milestones);
  contextCache = { text, builtAt: now };
  return text;
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  const client = getClient();
  if (!client) {
    return jsonError("AI assistant is not configured. Set OPENAI_API_KEY in environment.", 503);
  }

  try {
    const body = (await request.json()) as RequestBody;
    const userMessages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : [];
    const userEmail = typeof body.userEmail === "string" ? body.userEmail : undefined;
    const userName = typeof body.userName === "string" ? body.userName : undefined;

    if (userMessages.length === 0 || userMessages[userMessages.length - 1]?.role !== "user") {
      return jsonError("At least one user message is required.", 400);
    }

    const okrContext = await getCachedOkrContext();
    const systemWithContext = `${buildSystemPrompt(userEmail, userName)}\n\n--- LIVE OKR DATA ---\n${okrContext}\n--- END OKR DATA ---`;

    const stream = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemWithContext }, ...userMessages],
      temperature: 0.3,
      stream: true
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content ?? "";
            if (text) controller.enqueue(encoder.encode(text));
          }
        } finally {
          controller.close();
        }
      }
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI chat failed.";
    return jsonError(message, 500);
  }
}
