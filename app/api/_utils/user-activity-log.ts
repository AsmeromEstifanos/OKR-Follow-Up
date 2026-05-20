import { logUserActivity } from "@/lib/store";
import type { ActivityLogEntry } from "@/lib/types";
import type { NextRequest } from "next/server";

function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizePath(value: string): string {
  const trimmed = value.trim();
  return trimmed || "/";
}

function inferEntityTypeFromPath(pathname: string): string {
  const segments = normalizePath(pathname)
    .split("/")
    .filter((segment) => segment.length > 0);

  if (segments[0] !== "api") {
    return segments[0] ?? "unknown";
  }

  if (segments[1] === "config" && segments[2] === "ventures" && segments[4] === "departments") {
    return "position";
  }

  if (segments[1] === "config" && segments[2] === "ventures") {
    return "venture";
  }

  if (segments[1] === "config" && segments[2] === "admins") {
    return "admin";
  }

  if (segments[1] === "config" && segments[2] === "field-options") {
    return "dropdown-config";
  }

  if (segments[1] === "config" && segments[2] === "rag") {
    return "rag-config";
  }

  return segments[1] ?? "unknown";
}

function inferEntityKeyFromPath(pathname: string): string {
  const segments = normalizePath(pathname)
    .split("/")
    .filter((segment) => segment.length > 0);

  if (segments[0] !== "api") {
    return "";
  }

  if (segments[1] === "config" && segments[2] === "ventures" && segments[4] === "departments") {
    return segments[5] ?? "";
  }

  if (segments[1] === "config" && segments[2] === "ventures") {
    return segments[3] ?? "";
  }

  if (segments[1] === "config" && segments[2] === "admins") {
    return decodeURIComponent(segments[3] ?? "");
  }

  return segments[2] ?? "";
}

// Build a detailsJson string from a before/after diff of a plain object.
// Skips fields that haven't changed, null→null, or undefined on both sides.
export function buildActivityDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): string {
  const changes: Array<{ field: string; from: unknown; to: unknown }> = [];

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  keys.forEach((key) => {
    const from = before[key];
    const to = after[key];
    if (from === to) return;
    if (from === undefined && to === undefined) return;
    changes.push({ field: key, from: from ?? null, to: to ?? null });
  });

  if (changes.length === 0) return "";
  return JSON.stringify({ changes });
}

export async function logSuccessfulRequestActivity(
  request: NextRequest,
  activityName: string,
  result: unknown
): Promise<ActivityLogEntry | null> {
  const userEmail = normalizeEmail(request.headers.get("x-user-email"));
  if (!userEmail) {
    return null;
  }

  if (!(result instanceof Response) || !result.ok) {
    return null;
  }

  const routePath = normalizePath(request.nextUrl.pathname);
  const entityType = inferEntityTypeFromPath(routePath);
  const entityKey = inferEntityKeyFromPath(routePath);

  // Routes can attach enrichment via response headers:
  // x-activity-details — pre-built detailsJson string
  // x-activity-label   — human-readable entity label
  const detailsJson = result.headers.get("x-activity-details") ?? undefined;
  const entityLabel = result.headers.get("x-activity-label") ?? undefined;

  return logUserActivity({
    userEmail,
    activityName,
    httpMethod: request.method,
    routePath,
    entityType,
    entityKey,
    ...(entityLabel ? { entityLabel } : {}),
    ...(detailsJson ? { detailsJson } : {})
  });
}
