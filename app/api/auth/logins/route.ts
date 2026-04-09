import { logAuthSignIn } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeDisplayName(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      email?: unknown;
      displayName?: unknown;
    };

    const email =
      normalizeEmail(request.headers.get("x-user-email")) ||
      normalizeEmail(typeof body.email === "string" ? body.email : "");
    const displayName = normalizeDisplayName(typeof body.displayName === "string" ? body.displayName : "");

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const entry = await logAuthSignIn(email, displayName);
    return NextResponse.json({ logged: Boolean(entry), entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to log sign-in.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
