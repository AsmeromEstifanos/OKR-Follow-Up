import { deleteObjective, getObjectiveWithContext, updateObjective } from "@/lib/dummy-store";
import type { Confidence, ObjectiveStatus, ObjectiveType, OkrCycle, UpdateObjectiveInput } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = {
  params: {
    objectiveKey: string;
  };
};

const OBJECTIVE_TYPE_VALUES = new Set<ObjectiveType>(["Aspirational", "Committed", "Learning"]);
const OKR_CYCLE_VALUES = new Set<OkrCycle>(["Q1", "Q2", "Q3", "Q4"]);
const OBJECTIVE_STATUS_VALUES = new Set<ObjectiveStatus>(["NotStarted", "OnTrack", "AtRisk", "OffTrack", "Done"]);
const CONFIDENCE_VALUES = new Set<Confidence>(["High", "Medium", "Low"]);

const ALLOWED_PATCH_FIELDS = new Set([
  "periodKey",
  "title",
  "description",
  "owner",
  "department",
  "strategicTheme",
  "objectiveType",
  "okrCycle",
  "keyRisksDependency",
  "notes",
  "status",
  "confidence",
  "progressPct",
  "startDate",
  "endDate",
  "lastCheckinAt"
]);
const READ_ONLY_FIELDS = new Set(["objectiveKey", "rag"]);

function expectString(raw: Record<string, unknown>, field: string, allowEmpty = false): string {
  const value = raw[field];
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }

  if (!allowEmpty && value.trim().length === 0) {
    throw new Error(`${field} cannot be empty.`);
  }

  return value;
}

function expectEnum<T extends string>(raw: Record<string, unknown>, field: string, values: Set<T>): T {
  const value = raw[field];
  if (typeof value !== "string" || !values.has(value as T)) {
    throw new Error(`Invalid ${field}.`);
  }

  return value as T;
}

function expectNumber(raw: Record<string, unknown>, field: string): number {
  const value = raw[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a valid number.`);
  }

  return value;
}

function parseObjectivePatch(body: unknown): UpdateObjectiveInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid objective update payload.");
  }

  const raw = body as Record<string, unknown>;
  const keys = Object.keys(raw);

  if (keys.length === 0) {
    throw new Error("Objective update payload cannot be empty.");
  }

  const unsupported = keys.filter((key) => !ALLOWED_PATCH_FIELDS.has(key));
  if (unsupported.length > 0) {
    const readOnly = unsupported.filter((key) => READ_ONLY_FIELDS.has(key));
    if (readOnly.length > 0) {
      throw new Error(`These objective fields are read-only: ${readOnly.join(", ")}.`);
    }

    throw new Error(`Unsupported objective fields: ${unsupported.join(", ")}.`);
  }

  const patch: UpdateObjectiveInput = {};
  if (raw.periodKey !== undefined) {
    patch.periodKey = expectString(raw, "periodKey");
  }

  if (raw.title !== undefined) {
    patch.title = expectString(raw, "title");
  }

  if (raw.description !== undefined) {
    patch.description = expectString(raw, "description");
  }

  if (raw.owner !== undefined) {
    patch.owner = expectString(raw, "owner");
  }

  if (raw.department !== undefined) {
    patch.department = expectString(raw, "department");
  }

  if (raw.strategicTheme !== undefined) {
    patch.strategicTheme = expectString(raw, "strategicTheme");
  }

  if (raw.objectiveType !== undefined) {
    patch.objectiveType = expectEnum(raw, "objectiveType", OBJECTIVE_TYPE_VALUES);
  }

  if (raw.okrCycle !== undefined) {
    patch.okrCycle = expectEnum(raw, "okrCycle", OKR_CYCLE_VALUES);
  }

  if (raw.notes !== undefined) {
    patch.notes = expectString(raw, "notes", true);
  }

  if (raw.keyRisksDependency !== undefined) {
    patch.keyRisksDependency = expectString(raw, "keyRisksDependency", true);
  }

  if (raw.status !== undefined) {
    patch.status = expectEnum(raw, "status", OBJECTIVE_STATUS_VALUES);
  }

  if (raw.confidence !== undefined) {
    patch.confidence = expectEnum(raw, "confidence", CONFIDENCE_VALUES);
  }

  if (raw.progressPct !== undefined) {
    patch.progressPct = expectNumber(raw, "progressPct");
  }

  if (raw.startDate !== undefined) {
    patch.startDate = expectString(raw, "startDate");
  }

  if (raw.endDate !== undefined) {
    patch.endDate = expectString(raw, "endDate");
  }

  if (raw.lastCheckinAt !== undefined) {
    const value = raw.lastCheckinAt;
    if (value !== null && typeof value !== "string") {
      throw new Error("lastCheckinAt must be a string or null.");
    }

    patch.lastCheckinAt = value;
  }

  return patch;
}

export async function GET(_request: NextRequest, context: Context): Promise<NextResponse> {
  const objective = getObjectiveWithContext(context.params.objectiveKey);

  if (!objective) {
    return NextResponse.json({ error: "Objective not found." }, { status: 404 });
  }

  return NextResponse.json(objective);
}

export async function PATCH(request: NextRequest, context: Context): Promise<NextResponse> {
  try {
    const body = await request.json();
    const patch = parseObjectivePatch(body);
    const objective = updateObjective(context.params.objectiveKey, patch);

    if (!objective) {
      return NextResponse.json({ error: "Objective not found." }, { status: 404 });
    }

    return NextResponse.json(objective);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update objective.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, context: Context): Promise<NextResponse> {
  const deleted = deleteObjective(context.params.objectiveKey);

  if (!deleted) {
    return NextResponse.json({ error: "Objective not found." }, { status: 404 });
  }

  return NextResponse.json(deleted);
}
