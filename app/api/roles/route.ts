import { isAdminEmail, listRoleUsers, setUserRole } from "@/lib/store";
import type { AppRole, RoleUser } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_ROLES: AppRole[] = ["Admin", "Manager", "Editor", "Viewer"];

function normalizeEmail(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const callerEmail = normalizeEmail(request.headers.get("x-user-email"));
  if (!callerEmail || !(await isAdminEmail(callerEmail))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const users = await listRoleUsers();
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const callerEmail = normalizeEmail(request.headers.get("x-user-email"));
  if (!callerEmail || !(await isAdminEmail(callerEmail))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const email = normalizeEmail(raw.email as string | null);
  const role = (typeof raw.role === "string" ? raw.role.trim() : "") as AppRole;
  const displayName = typeof raw.displayName === "string" ? raw.displayName.trim() : undefined;

  if (!email) return NextResponse.json({ error: "email is required." }, { status: 400 });
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: `role must be one of: ${VALID_ROLES.join(", ")}.` }, { status: 400 });
  }

  await setUserRole(email, role, displayName);
  const users = await listRoleUsers();
  return NextResponse.json({ users });
}
