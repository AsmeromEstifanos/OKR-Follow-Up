import { requireAdmin } from "@/app/api/_utils/admin-guard";
import { withOperationProgress } from "@/app/api/_utils/with-operation-progress";
import { addDepartmentToVenture } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = {
  params: {
    ventureKey: string;
  };
};

export async function POST(request: NextRequest, context: Context): Promise<NextResponse> {
  return withOperationProgress(request, "Creating position", async () => {
    const blocked = await requireAdmin(request);
    if (blocked) {
      return blocked;
    }

    try {
      const payload = await request.json();
      const venture = await addDepartmentToVenture(context.params.ventureKey, payload);

      if (!venture) {
        return NextResponse.json({ error: "Venture not found." }, { status: 404 });
      }

      return NextResponse.json(venture, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add department.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}
