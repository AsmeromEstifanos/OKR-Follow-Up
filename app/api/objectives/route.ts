import { requireDepartmentOwnerOrAdminForObjectiveCreate } from "@/app/api/_utils/department-owner-guard";
import { withOperationProgress } from "@/app/api/_utils/with-operation-progress";
import { createObjective, listObjectives } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const objectives = await listObjectives({
    periodKey: searchParams.get("periodKey") ?? undefined,
    department: searchParams.get("department") ?? undefined,
    owner: searchParams.get("owner") ?? undefined,
    status: searchParams.get("status") ?? undefined
  });

  return NextResponse.json(objectives);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withOperationProgress(request, "Creating objective", async () => {
    try {
      const body = await request.json();
      const blocked = await requireDepartmentOwnerOrAdminForObjectiveCreate(request, {
        department: typeof body?.department === "string" ? body.department : undefined,
        ventureName: typeof body?.ventureName === "string" ? body.ventureName : undefined
      });
      if (blocked) {
        return blocked;
      }

      const objective = await createObjective(body);
      return NextResponse.json(objective, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create objective.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}
