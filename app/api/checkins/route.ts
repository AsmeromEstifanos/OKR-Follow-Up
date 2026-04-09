import { withOperationProgress } from "@/app/api/_utils/with-operation-progress";
import { createCheckIn, listCheckIns } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const checkIns = await listCheckIns({
    periodKey: searchParams.get("periodKey") ?? undefined,
    objectiveKey: searchParams.get("objectiveKey") ?? undefined,
    krKey: searchParams.get("krKey") ?? undefined,
    owner: searchParams.get("owner") ?? undefined
  });

  return NextResponse.json(checkIns);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withOperationProgress(request, "Saving check-in", async () => {
    try {
      const body = await request.json();
      const checkIn = await createCheckIn(body);
      return NextResponse.json(checkIn, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create check-in.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}
