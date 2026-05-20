import { getUserRole, isAdminEmail } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeEmail(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const email = normalizeEmail(request.headers.get("x-user-email"));
  if (!email) {
    return NextResponse.json({ email: "", isAdmin: false, role: null });
  }

  const [admin, role] = await Promise.all([isAdminEmail(email), getUserRole(email)]);
  return NextResponse.json({ email, isAdmin: admin, role: role ?? null });
}
