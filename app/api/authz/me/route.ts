import { isAdminEmail } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeEmail(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const email = normalizeEmail(request.headers.get("x-user-email"));
  if (!email) {
    return NextResponse.json({ email: "", isAdmin: false });
  }

  const admin = await isAdminEmail(email);
  return NextResponse.json({ email, isAdmin: admin });
}
