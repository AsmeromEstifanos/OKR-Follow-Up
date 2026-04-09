import { withOperationProgress } from "@/app/api/_utils/with-operation-progress";
import { createPeriod, listPeriods } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(await listPeriods());
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withOperationProgress(request, "Creating period", async () => {
    try {
      const body = await request.json();
      const period = await createPeriod(body);
      return NextResponse.json(period, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create period.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}
