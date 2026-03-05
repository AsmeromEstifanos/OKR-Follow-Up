import { previewNextKrCode } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const objectiveKey = searchParams.get("objectiveKey")?.trim() ?? "";

  if (!objectiveKey) {
    return NextResponse.json({ error: "objectiveKey is required." }, { status: 400 });
  }

  const code = await previewNextKrCode(objectiveKey);
  return NextResponse.json({ code });
}

