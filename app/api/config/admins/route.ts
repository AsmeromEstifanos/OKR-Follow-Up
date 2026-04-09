import { requireAdmin } from "@/app/api/_utils/admin-guard";
import { withOperationProgress } from "@/app/api/_utils/with-operation-progress";
import { addAdminEmail, listAdmins } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const admins = await listAdmins();
  return NextResponse.json({ admins });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withOperationProgress(request, "Saving admin access", async () => {
    const guard = await requireAdmin(request);
    if (guard) {
      return guard;
    }

    try {
      const payload = (await request.json()) as { email?: string; displayName?: string };
      await addAdminEmail(payload.email ?? "", payload.displayName);
      const admins = await listAdmins();
      return NextResponse.json({ admins });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add admin user.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}
