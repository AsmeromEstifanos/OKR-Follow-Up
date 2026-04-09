import { requireAdmin } from "@/app/api/_utils/admin-guard";
import { withOperationProgress } from "@/app/api/_utils/with-operation-progress";
import { listAdmins, removeAdminEmail } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = {
  params: {
    email: string;
  };
};

export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
  return withOperationProgress(request, "Removing admin access", async () => {
    const guard = await requireAdmin(request);
    if (guard) {
      return guard;
    }

    try {
      const decodedEmail = decodeURIComponent(params.email ?? "");
      await removeAdminEmail(decodedEmail);
      const admins = await listAdmins();
      return NextResponse.json({ admins });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to remove admin user.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}
