import { isAdminEmail, removeUserRole } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: { email: string } };

function normalizeEmail(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

export async function DELETE(request: NextRequest, context: Context): Promise<NextResponse> {
  const callerEmail = normalizeEmail(request.headers.get("x-user-email"));
  if (!callerEmail || !(await isAdminEmail(callerEmail))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const targetEmail = normalizeEmail(decodeURIComponent(context.params.email));
  if (!targetEmail) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  await removeUserRole(targetEmail);
  return NextResponse.json({ ok: true });
}
