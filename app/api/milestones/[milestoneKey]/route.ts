import { deleteMilestone, updateMilestone } from "@/lib/store";
import type { UpdateMilestoneInput } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = {
  params: {
    milestoneKey: string;
  };
};

function parseNullableNumber(value: unknown, fieldName: string): number | null {
  if (value === null || value === "") {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a valid number or empty.`);
  }

  return value;
}

function parsePatch(body: unknown): UpdateMilestoneInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid milestone update payload.");
  }

  const raw = body as Record<string, unknown>;
  const patch: UpdateMilestoneInput = {};

  if (raw.title !== undefined) {
    if (typeof raw.title !== "string") {
      throw new Error("title must be a string.");
    }

    patch.title = raw.title;
  }

  if (raw.weight !== undefined) {
    if (typeof raw.weight !== "number" || !Number.isFinite(raw.weight)) {
      throw new Error("weight must be a valid number.");
    }

    patch.weight = raw.weight;
  }

  if (raw.targetValue !== undefined) {
    patch.targetValue = parseNullableNumber(raw.targetValue, "targetValue");
  }

  if (raw.currentValue !== undefined) {
    patch.currentValue = parseNullableNumber(raw.currentValue, "currentValue");
  }

  if (raw.progressPct !== undefined) {
    if (typeof raw.progressPct !== "number" || !Number.isFinite(raw.progressPct)) {
      throw new Error("progressPct must be a valid number.");
    }

    patch.progressPct = raw.progressPct;
  }

  if (raw.sequence !== undefined) {
    if (typeof raw.sequence !== "number" || !Number.isInteger(raw.sequence)) {
      throw new Error("sequence must be an integer.");
    }

    patch.sequence = raw.sequence;
  }

  return patch;
}

export async function PATCH(request: NextRequest, context: Context): Promise<NextResponse> {
  try {
    const patch = parsePatch(await request.json());
    const milestone = await updateMilestone(context.params.milestoneKey, patch);

    if (!milestone) {
      return NextResponse.json({ error: "Milestone not found." }, { status: 404 });
    }

    return NextResponse.json(milestone);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update milestone.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, context: Context): Promise<NextResponse> {
  const deleted = await deleteMilestone(context.params.milestoneKey);

  if (!deleted) {
    return NextResponse.json({ error: "Milestone not found." }, { status: 404 });
  }

  return NextResponse.json(deleted);
}
