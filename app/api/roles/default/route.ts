import { getDefaultRole, isAdminEmail, setDefaultRole } from "@/lib/store";
import type { AppRole } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userEmail = (request.headers.get("x-user-email") ?? "").trim().toLowerCase();
  if (!userEmail) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const isAdmin = await isAdminEmail(userEmail);
  if (!isAdmin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const role = await getDefaultRole();
  return NextResponse.json({ defaultRole: role });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const userEmail = (request.headers.get("x-user-email") ?? "").trim().toLowerCase();
  if (!userEmail) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const isAdmin = await isAdminEmail(userEmail);
  if (!isAdmin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const body = await request.json() as { defaultRole?: string | null };
  const valid: AppRole[] = ["Admin", "Manager", "Editor", "Viewer"];
  const role = body.defaultRole;

  if (role !== null && role !== undefined && !valid.includes(role as AppRole)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  await setDefaultRole((role as AppRole) ?? null);
  return NextResponse.json({ defaultRole: role ?? null });
}
