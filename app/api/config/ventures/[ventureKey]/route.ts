import { requireAdmin } from "@/app/api/_utils/admin-guard";
import { withOperationProgress } from "@/app/api/_utils/with-operation-progress";
import { deleteVenture, updateVenture } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = {
  params: {
    ventureKey: string;
  };
};

export async function PATCH(request: NextRequest, context: Context): Promise<NextResponse> {
  return withOperationProgress(request, "Updating venture", async () => {
    const blocked = await requireAdmin(request);
    if (blocked) {
      return blocked;
    }

    try {
      const payload = await request.json();
      const venture = await updateVenture(context.params.ventureKey, payload);

      if (!venture) {
        return NextResponse.json({ error: "Venture not found." }, { status: 404 });
      }

      return NextResponse.json(venture);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update venture.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}

export async function DELETE(request: NextRequest, context: Context): Promise<NextResponse> {
  return withOperationProgress(request, "Deleting venture", async () => {
    const blocked = await requireAdmin(request);
    if (blocked) {
      return blocked;
    }

    try {
      const deleted = await deleteVenture(context.params.ventureKey);

      if (!deleted) {
        return NextResponse.json({ error: "Venture not found." }, { status: 404 });
      }

      return NextResponse.json({ deleted: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete venture.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}
