import { requireAdmin } from "@/app/api/_utils/admin-guard";
import { withOperationProgress } from "@/app/api/_utils/with-operation-progress";
import { updateFieldOptions } from "@/lib/store";
import type { FieldOptions } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  return withOperationProgress(request, "Saving dropdown configuration", async () => {
    const guard = await requireAdmin(request);
    if (guard) {
      return guard;
    }

    try {
      const payload = (await request.json()) as Partial<FieldOptions>;
      const config = await updateFieldOptions(payload);
      return NextResponse.json(config);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update field options.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}
