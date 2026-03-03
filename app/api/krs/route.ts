import { createKeyResult, listKeyResults } from "@/lib/dummy-store";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const keyResults = listKeyResults({
    periodKey: searchParams.get("periodKey") ?? undefined,
    objectiveKey: searchParams.get("objectiveKey") ?? undefined,
    owner: searchParams.get("owner") ?? undefined,
    status: searchParams.get("status") ?? undefined
  });

  return NextResponse.json(keyResults);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const keyResult = createKeyResult(body);
    return NextResponse.json(keyResult, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create key result.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

