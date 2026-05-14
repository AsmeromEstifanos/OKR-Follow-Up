import { listCheckIns, listKeyResults, listMilestones, listObjectives, listPeriods } from "@/lib/store";
import type { CheckIn, KeyResult, Milestone, Objective, Period } from "@/lib/types";
import { NextRequest } from "next/server";
import OpenAI from "openai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ChatMessage = { role: "user" | "assistant"; content: string };
type RequestBody = { messages?: ChatMessage[]; userEmail?: string; userName?: string };
type OkrData = {
  periods: Period[];
  objectives: Objective[];
  keyResults: KeyResult[];
  checkIns: CheckIn[];
  milestones: Milestone[];
};

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

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9@._\s-]+/g, " ").replace(/\s+/g, " ").trim();
}

function isBroadQuestion(question: string): boolean {
  const q = normalizeText(question);
  return [
    "all okr",
    "all objective",
    "all key result",
    "everything",
    "entire",
    "organization",
    "organisation",
    "company",
    "overall",
    "dashboard",
    "summary of okr",
    "okr summary",
    "breakdown",
    "compare departments",
    "compare ventures"
  ].some((term) => q.includes(term));
}

function latestCheckInsByKr(checkIns: CheckIn[]): Map<string, CheckIn> {
  const latest = new Map<string, CheckIn>();
  for (const ci of checkIns) {
    const existing = latest.get(ci.krKey);
    if (!existing || ci.checkInAt > existing.checkInAt) {
      latest.set(ci.krKey, ci);
    }
  }
  return latest;
}

function uniqueTokens(text: string): string[] {
  return [...new Set(normalizeText(text).split(" ").filter((token) => token.length >= 3))];
}

function scoreTextMatch(questionTokens: string[], fields: string[]): number {
  const haystack = normalizeText(fields.join(" "));
  let score = 0;
  for (const token of questionTokens) {
    if (haystack.includes(token)) score++;
  }
  return score;
}

function buildFocusedOkrContext(data: OkrData, question: string, userEmail?: string): string {
  if (isBroadQuestion(question)) {
    return buildOkrContext(data.periods, data.objectives, data.keyResults, data.checkIns, data.milestones);
  }

  const q = normalizeText(question);
  const tokens = uniqueTokens(question);
  const activePeriodKeys = new Set(data.periods.filter((p) => p.status === "Active").map((p) => p.periodKey));
  const latestCheckIn = latestCheckInsByKr(data.checkIns);
  const selectedObjectives = new Map<string, Objective>();
  const selectedKrs = new Map<string, KeyResult>();

  function addObjective(objective: Objective): void {
    selectedObjectives.set(objective.objectiveKey, objective);
    for (const kr of data.keyResults) {
      if (kr.objectiveKey === objective.objectiveKey) {
        selectedKrs.set(kr.krKey, kr);
      }
    }
  }

  function addKr(kr: KeyResult): void {
    selectedKrs.set(kr.krKey, kr);
    const objective = data.objectives.find((obj) => obj.objectiveKey === kr.objectiveKey);
    if (objective) selectedObjectives.set(objective.objectiveKey, objective);
  }

  const asksMine = /\b(my|mine|me|i own|assigned to me)\b/.test(q);
  if (asksMine && userEmail) {
    const email = userEmail.toLowerCase();
    data.objectives.filter((obj) => obj.ownerEmail?.toLowerCase() === email).forEach(addObjective);
    data.keyResults.filter((kr) => kr.ownerEmail?.toLowerCase() === email).forEach(addKr);
  }

  const asksRisk = /\b(risk|risks|risky|red|amber|blocker|blockers|blocked|support|attention)\b/.test(q);
  if (asksRisk) {
    data.objectives
      .filter((obj) => activePeriodKeys.has(obj.periodKey) && (obj.rag === "Red" || obj.rag === "Amber" || Boolean(obj.blockers)))
      .forEach(addObjective);
    data.keyResults
      .filter((kr) => activePeriodKeys.has(kr.periodKey) && (Boolean(kr.blockers) || Boolean(kr.supportNeeded)))
      .forEach(addKr);
  }

  const asksCheckIn = /\b(check-in|checkin|check in|overdue|missing update|no recent)\b/.test(q);
  if (asksCheckIn) {
    data.keyResults
      .filter((kr) => activePeriodKeys.has(kr.periodKey) && !latestCheckIn.has(kr.krKey))
      .forEach(addKr);
  }

  for (const obj of data.objectives) {
    const fields = [
      obj.objectiveKey,
      obj.objectiveCode ?? "",
      obj.title,
      obj.owner ?? "",
      obj.ownerEmail ?? "",
      obj.department,
      obj.ventureName ?? "",
      obj.strategicTheme
    ];
    if (fields.some((field) => field && q.includes(normalizeText(field)))) {
      addObjective(obj);
    }
  }

  for (const kr of data.keyResults) {
    const fields = [
      kr.krKey,
      kr.krCode ?? "",
      kr.title,
      kr.owner ?? "",
      kr.ownerEmail ?? "",
      kr.status
    ];
    if (fields.some((field) => field && q.includes(normalizeText(field)))) {
      addKr(kr);
    }
  }

  if (selectedObjectives.size === 0 && selectedKrs.size === 0) {
    const objectiveScores = data.objectives
      .filter((obj) => activePeriodKeys.has(obj.periodKey))
      .map((obj) => ({
        obj,
        score: scoreTextMatch(tokens, [
          obj.title,
          obj.objectiveCode ?? "",
          obj.department,
          obj.ventureName ?? "",
          obj.owner ?? "",
          obj.ownerEmail ?? "",
          obj.blockers ?? "",
          obj.notes ?? ""
        ])
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    objectiveScores.forEach(({ obj }) => addObjective(obj));

    const krScores = data.keyResults
      .filter((kr) => activePeriodKeys.has(kr.periodKey))
      .map((kr) => ({
        kr,
        score: scoreTextMatch(tokens, [
          kr.title,
          kr.krCode ?? "",
          kr.owner ?? "",
          kr.ownerEmail ?? "",
          kr.status,
          kr.blockers ?? "",
          kr.supportNeeded ?? "",
          kr.notes ?? ""
        ])
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
    krScores.forEach(({ kr }) => addKr(kr));
  }

  if (selectedObjectives.size === 0 && selectedKrs.size === 0) {
    const activeObjectives = data.objectives.filter((obj) => activePeriodKeys.has(obj.periodKey));
    return [
      "=== COMPACT ACTIVE OKR CATALOG ===",
      "No narrow match was found for the question. Use this compact catalog to answer only if sufficient; otherwise say what detail is missing.",
      ...activeObjectives.map(
        (obj) =>
          `OBJECTIVE: ${obj.objectiveCode ?? obj.objectiveKey} — "${obj.title}" | ${obj.ventureName ?? "General"} / ${obj.department} | Owner: ${obj.ownerEmail ?? obj.owner ?? "unassigned"} | Progress: ${obj.progressPct}% | RAG: ${obj.rag}`
      )
    ].join("\n");
  }

  const objectiveList = [...selectedObjectives.values()].slice(0, 12);
  const selectedObjectiveKeys = new Set(objectiveList.map((obj) => obj.objectiveKey));
  const krList = [...selectedKrs.values()]
    .filter((kr) => selectedObjectiveKeys.has(kr.objectiveKey) || selectedKrs.has(kr.krKey))
    .slice(0, 30);
  const krKeys = new Set(krList.map((kr) => kr.krKey));
  const milestoneList = data.milestones.filter((m) => krKeys.has(m.krKey)).slice(0, 60);

  const lines: string[] = [];
  lines.push("=== FOCUSED OKR DATA ===");
  lines.push(`Retrieval scope: ${objectiveList.length} objective(s), ${krList.length} key result(s).`);
  lines.push("If the answer needs records outside this focused context, say that the current retrieved context is insufficient.");

  for (const obj of objectiveList) {
    lines.push(`\nOBJECTIVE: ${obj.objectiveCode ?? obj.objectiveKey} — "${obj.title}"`);
    lines.push(
      `  Venture/Department: ${obj.ventureName ?? "General"} / ${obj.department} | Owner: ${obj.ownerEmail ?? obj.owner ?? "unassigned"}`
    );
    lines.push(`  Progress: ${obj.progressPct}% | RAG: ${obj.rag} | Status: ${obj.status} | Confidence: ${obj.confidence}`);
    if (obj.description) lines.push(`  Description: ${obj.description}`);
    if (obj.blockers) lines.push(`  Blockers: ${obj.blockers}`);
    if (obj.keyRisksDependency) lines.push(`  Risks/dependencies: ${obj.keyRisksDependency}`);
    if (obj.notes) lines.push(`  Notes: ${obj.notes}`);

    for (const kr of krList.filter((item) => item.objectiveKey === obj.objectiveKey)) {
      const latest = latestCheckIn.get(kr.krKey);
      lines.push(`  KR: ${kr.krCode ?? kr.krKey} — "${kr.title}"`);
      lines.push(
        `    Progress: ${kr.progressPct}% (${kr.currentValue}/${kr.targetValue} ${kr.metricType}) | Status: ${kr.status} | Due: ${kr.dueDate || "—"} | Owner: ${kr.ownerEmail ?? kr.owner ?? "unassigned"}`
      );
      if (kr.blockers) lines.push(`    Blockers: ${kr.blockers}`);
      if (kr.supportNeeded) lines.push(`    Support needed: ${kr.supportNeeded}`);
      if (kr.notes) lines.push(`    Notes: ${kr.notes}`);
      if (latest) {
        lines.push(`    Last check-in (${latest.checkInAt.slice(0, 10)}): ${latest.updateNotes || "(no notes)"}`);
        if (latest.blockers) lines.push(`    Check-in blockers: ${latest.blockers}`);
        if (latest.supportNeeded) lines.push(`    Check-in support needed: ${latest.supportNeeded}`);
      } else {
        lines.push("    Last check-in: NONE");
      }

      for (const m of milestoneList.filter((item) => item.krKey === kr.krKey)) {
        lines.push(`    Milestone: "${m.title}" — Progress: ${m.progressPct}% | Weight: ${m.weight}`);
      }
    }
  }

  return lines.join("\n");
}

function buildSystemPrompt(userEmail: string | undefined, userName: string | undefined): string {
  let userLine: string;
  if (userName && userEmail) {
    userLine = `The user you are speaking with is ${userName} (${userEmail}). You may address them by their first name. When they say "I", "me", "my", "mine", an objective or key result is theirs ONLY if its Owner email exactly matches ${userEmail}. Never assume an objective or KR belongs to them just because it appears in the data, the current venture, or the current view.`;
  } else if (userEmail) {
    userLine = `The user you are speaking with is signed in as: ${userEmail}. When they say "I", "me", "my", "mine", an objective or key result is theirs ONLY if its Owner email exactly matches ${userEmail}. Never assume an objective or KR belongs to them just because it appears in the data or the current view.`;
  } else {
    userLine = "The signed-in user is unknown. Do not claim any objective or KR belongs to them.";
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
9. NEVER ASSUME OWNERSHIP. When the user asks about "my OKRs", "my objectives", "my key results", or anything about what belongs to them, include ONLY items whose Owner email exactly matches the signed-in user's email. If none match, say so plainly (e.g. "You don't own any objectives in this data."). Do not present other people's OKRs as if they were the user's — every objective and KR has its own explicit owner shown in the data, and you must respect it.

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
6. The "body" field is PLAIN TEXT only. Outlook receives the body literally — every character shows up exactly as you write it. NEVER wrap titles or names in asterisks, underscores, or any other emphasis marks. NEVER use markdown of any kind (no **bold**, no *italics*, no __underline__, no # headers, no backticks, no >quotes). Plain prose with line breaks (\\n) and blank lines (\\n\\n) between paragraphs. Numbered lists and dash bullets are fine because they're already plain text.

BAD body example (DO NOT write the body this way):
"1. **All material capital matters escalated to SVH...**\\n- Progress: 100%"

GOOD body example (write the body this way):
"1. All material capital matters escalated to SVH...\\n- Progress: 100%"

Keep it professional, warm, and concise.`;
}

const CONTEXT_TTL_MS = 10 * 60 * 1000;
let dataCache: { data: OkrData; builtAt: number } | null = null;

async function getCachedOkrData(): Promise<OkrData> {
  const now = Date.now();
  if (dataCache && now - dataCache.builtAt < CONTEXT_TTL_MS) {
    return dataCache.data;
  }

  const [periods, objectives, keyResults, checkIns, milestones] = await Promise.all([
    listPeriods(),
    listObjectives({}),
    listKeyResults({}),
    listCheckIns({}),
    listMilestones({})
  ]);

  const data = { periods, objectives, keyResults, checkIns, milestones };
  dataCache = { data, builtAt: now };
  return data;
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

    const latestUserMessage = userMessages[userMessages.length - 1]?.content ?? "";
    const okrData = await getCachedOkrData();
    const okrContext = buildFocusedOkrContext(okrData, latestUserMessage, userEmail);
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
