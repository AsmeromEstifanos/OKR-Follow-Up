import { deleteKeyResult, getKeyResult, updateKeyResult } from "@/lib/dummy-store";
import type { CheckInFrequency, KrStatus, MetricType, UpdateKeyResultInput } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = {
  params: {
    krKey: string;
  };
};

const METRIC_TYPE_VALUES = new Set<MetricType>(["Delivery", "Financial", "Operational", "People", "Quality"]);
const KR_STATUS_VALUES = new Set<KrStatus>(["NotStarted", "OnTrack", "AtRisk", "OffTrack", "Done"]);
const CHECKIN_FREQUENCY_VALUES = new Set<CheckInFrequency>(["Weekly", "BiWeekly", "Monthly", "AdHoc"]);
const ALLOWED_PATCH_FIELDS = new Set([
  "objectiveKey",
  "periodKey",
  "title",
  "owner",
  "metricType",
  "baselineValue",
  "targetValue",
  "currentValue",
  "status",
  "dueDate",
  "checkInFrequency",
  "notes",
  "lastCheckinAt"
]);
const READ_ONLY_FIELDS = new Set(["krKey", "progressPct"]);

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

function expectNumber(raw: Record<string, unknown>, field: string): number {
  const value = raw[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a valid number.`);
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

function parseKrPatch(body: unknown): UpdateKeyResultInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid key result update payload.");
  }

  const raw = body as Record<string, unknown>;
  const keys = Object.keys(raw);

  if (keys.length === 0) {
    throw new Error("Key result update payload cannot be empty.");
  }

  const unsupported = keys.filter((key) => !ALLOWED_PATCH_FIELDS.has(key));
  if (unsupported.length > 0) {
    const readOnly = unsupported.filter((key) => READ_ONLY_FIELDS.has(key));
    if (readOnly.length > 0) {
      throw new Error(`These key result fields are read-only: ${readOnly.join(", ")}.`);
    }

    throw new Error(`Unsupported key result fields: ${unsupported.join(", ")}.`);
  }

  const patch: UpdateKeyResultInput = {};
  if (raw.objectiveKey !== undefined) {
    patch.objectiveKey = expectString(raw, "objectiveKey");
  }

  if (raw.periodKey !== undefined) {
    patch.periodKey = expectString(raw, "periodKey");
  }

  if (raw.title !== undefined) {
    patch.title = expectString(raw, "title");
  }

  if (raw.owner !== undefined) {
    patch.owner = expectString(raw, "owner");
  }

  if (raw.metricType !== undefined) {
    patch.metricType = expectEnum(raw, "metricType", METRIC_TYPE_VALUES);
  }

  if (raw.baselineValue !== undefined) {
    patch.baselineValue = expectNumber(raw, "baselineValue");
  }

  if (raw.targetValue !== undefined) {
    patch.targetValue = expectNumber(raw, "targetValue");
  }

  if (raw.currentValue !== undefined) {
    patch.currentValue = expectNumber(raw, "currentValue");
  }

  if (raw.status !== undefined) {
    patch.status = expectEnum(raw, "status", KR_STATUS_VALUES);
  }

  if (raw.dueDate !== undefined) {
    patch.dueDate = expectString(raw, "dueDate");
  }

  if (raw.checkInFrequency !== undefined) {
    patch.checkInFrequency = expectEnum(raw, "checkInFrequency", CHECKIN_FREQUENCY_VALUES);
  }

  if (raw.notes !== undefined) {
    patch.notes = expectString(raw, "notes", true);
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
  const keyResult = getKeyResult(context.params.krKey);

  if (!keyResult) {
    return NextResponse.json({ error: "Key result not found." }, { status: 404 });
  }

  return NextResponse.json(keyResult);
}

export async function PATCH(request: NextRequest, context: Context): Promise<NextResponse> {
  try {
    const body = await request.json();
    const patch = parseKrPatch(body);
    const keyResult = updateKeyResult(context.params.krKey, patch);

    if (!keyResult) {
      return NextResponse.json({ error: "Key result not found." }, { status: 404 });
    }

    return NextResponse.json(keyResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update key result.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, context: Context): Promise<NextResponse> {
  const deleted = deleteKeyResult(context.params.krKey);

  if (!deleted) {
    return NextResponse.json({ error: "Key result not found." }, { status: 404 });
  }

  return NextResponse.json(deleted);
}
