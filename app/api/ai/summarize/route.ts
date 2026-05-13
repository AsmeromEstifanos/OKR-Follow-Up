import { getObjectiveWithContext, listCheckIns } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function buildPrompt(data: Awaited<ReturnType<typeof getObjectiveWithContext>>): string {
  if (!data) return "";

  const { objective, keyResults, latestCheckIns } = data;

  const krSummaries = keyResults
    .map((kr) => {
      const latest = latestCheckIns[kr.krKey];
      const lines = [
        `- KR: ${kr.title} (${kr.progressPct}% complete, status: ${kr.status})`,
        latest?.updateNotes ? `  Latest notes: ${latest.updateNotes}` : "",
        latest?.blockers ? `  Blockers: ${latest.blockers}` : kr.blockers ? `  Blockers: ${kr.blockers}` : "",
        latest?.supportNeeded ? `  Support needed: ${latest.supportNeeded}` : ""
      ].filter(Boolean);
      return lines.join("\n");
    })
    .join("\n");

  return `You are an OKR performance analyst. Given the following objective data, provide a concise executive summary (3-5 sentences) covering: overall progress, key risks or blockers, confidence level, and recommended next actions.

OBJECTIVE: ${objective.title}
Code: ${objective.objectiveCode ?? objective.objectiveKey}
Status: ${objective.status} | RAG: ${objective.rag} | Progress: ${objective.progressPct}%
Confidence: ${objective.confidence}
Department: ${objective.department}${objective.ventureName ? ` (${objective.ventureName})` : ""}
${objective.description ? `Description: ${objective.description}\n` : ""}${objective.blockers ? `Blockers: ${objective.blockers}\n` : ""}${objective.notes ? `Notes: ${objective.notes}\n` : ""}
KEY RESULTS:
${krSummaries || "No key results defined yet."}

Write a concise, actionable summary for leadership. Be direct and highlight what needs attention.`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const client = getClient();
  if (!client) {
    return NextResponse.json({ error: "AI summarization is not configured. Set OPENAI_API_KEY in environment." }, { status: 503 });
  }

  try {
    const body = (await request.json()) as { objectiveKey?: string };
    const objectiveKey = (body.objectiveKey ?? "").trim();

    if (!objectiveKey) {
      return NextResponse.json({ error: "objectiveKey is required." }, { status: 400 });
    }

    const data = await getObjectiveWithContext(objectiveKey);
    if (!data) {
      return NextResponse.json({ error: "Objective not found." }, { status: 404 });
    }

    const prompt = buildPrompt(data);

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 400,
      temperature: 0.4
    });

    const summary = completion.choices[0]?.message?.content?.trim() ?? "";

    return NextResponse.json({ summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI summarization failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
