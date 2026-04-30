import { createMilestone, listMilestones } from "@/lib/store";
import type { CreateMilestoneInput } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const milestones = await listMilestones({
    krKey: searchParams.get("krKey") ?? undefined
  });

  return NextResponse.json(milestones);
}

function parseNullableNumber(value: unknown, fieldName: string): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a valid number or empty.`);
  }

  return value;
}

function parseCreate(body: unknown): CreateMilestoneInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid milestone payload.");
  }

  const raw = body as Record<string, unknown>;
  if (typeof raw.krKey !== "string" || !raw.krKey.trim()) {
    throw new Error("krKey is required.");
  }

  if (typeof raw.title !== "string" || !raw.title.trim()) {
    throw new Error("title is required.");
  }

  if (typeof raw.weight !== "number" || !Number.isFinite(raw.weight)) {
    throw new Error("weight must be a valid number.");
  }

  let progressPct: number | undefined;
  if (raw.progressPct !== undefined) {
    if (typeof raw.progressPct !== "number" || !Number.isFinite(raw.progressPct)) {
      throw new Error("progressPct must be a valid number.");
    }

    progressPct = raw.progressPct;
  }

  return {
    krKey: raw.krKey,
    title: raw.title,
    weight: raw.weight,
    targetValue: parseNullableNumber(raw.targetValue, "targetValue"),
    currentValue: parseNullableNumber(raw.currentValue, "currentValue"),
    ...(progressPct !== undefined ? { progressPct } : {})
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const milestone = await createMilestone(parseCreate(await request.json()));
    return NextResponse.json(milestone, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create milestone.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
