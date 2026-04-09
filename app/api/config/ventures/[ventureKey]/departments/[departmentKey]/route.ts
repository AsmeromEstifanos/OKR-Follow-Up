import { requireAdmin } from "@/app/api/_utils/admin-guard";
import { withOperationProgress } from "@/app/api/_utils/with-operation-progress";
import { deleteDepartmentFromVenture, updateDepartmentInVenture } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = {
  params: {
    ventureKey: string;
    departmentKey: string;
  };
};

export async function PATCH(request: NextRequest, context: Context): Promise<NextResponse> {
  return withOperationProgress(request, "Updating position", async () => {
    const blocked = await requireAdmin(request);
    if (blocked) {
      return blocked;
    }

    try {
      const payload = await request.json();
      const venture = await updateDepartmentInVenture(context.params.ventureKey, context.params.departmentKey, payload);

      if (!venture) {
        return NextResponse.json({ error: "Venture or department not found." }, { status: 404 });
      }

      return NextResponse.json(venture);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update department.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}

export async function DELETE(request: NextRequest, context: Context): Promise<NextResponse> {
  return withOperationProgress(request, "Deleting position", async () => {
    const blocked = await requireAdmin(request);
    if (blocked) {
      return blocked;
    }

    try {
      const venture = await deleteDepartmentFromVenture(context.params.ventureKey, context.params.departmentKey);

      if (!venture) {
        return NextResponse.json({ error: "Venture or department not found." }, { status: 404 });
      }

      return NextResponse.json(venture);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete department.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}
