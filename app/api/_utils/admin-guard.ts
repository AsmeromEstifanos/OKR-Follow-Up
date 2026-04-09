import { isAdminEmail } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

function normalizeEmail(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

export async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  const userEmail = normalizeEmail(request.headers.get("x-user-email"));
  if (!userEmail) {
    return NextResponse.json({ error: "Missing signed-in user email." }, { status: 401 });
  }

  const isAdmin = await isAdminEmail(userEmail);
  if (!isAdmin) {
    return NextResponse.json({ error: "Only admins can manage ventures and positions." }, { status: 403 });
  }

  return null;
}

