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

  return logUserActivity({
    userEmail,
    activityName,
    httpMethod: request.method,
    routePath,
    entityType,
    entityKey
  });
}
