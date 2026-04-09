import { requireDepartmentOwnerOrAdminForKrCreate } from "@/app/api/_utils/department-owner-guard";
import { withOperationProgress } from "@/app/api/_utils/with-operation-progress";
import { createKeyResult, listKeyResults } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const keyResults = await listKeyResults({
    periodKey: searchParams.get("periodKey") ?? undefined,
    objectiveKey: searchParams.get("objectiveKey") ?? undefined,
    owner: searchParams.get("owner") ?? undefined,
    status: searchParams.get("status") ?? undefined
  });

  return NextResponse.json(keyResults);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withOperationProgress(request, "Creating key result", async () => {
    try {
      const body = await request.json();
      const blocked = await requireDepartmentOwnerOrAdminForKrCreate(request, {
        objectiveKey: typeof body?.objectiveKey === "string" ? body.objectiveKey : undefined
      });
      if (blocked) {
        return blocked;
      }

      const keyResult = await createKeyResult(body);
      return NextResponse.json(keyResult, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create key result.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}
