import { updateRagThresholds } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await request.json();
    const config = await updateRagThresholds(payload);
    return NextResponse.json(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update RAG thresholds.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
