import { createObjective, listObjectives } from "@/lib/dummy-store";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const objectives = listObjectives({
    periodKey: searchParams.get("periodKey") ?? undefined,
    department: searchParams.get("department") ?? undefined,
    owner: searchParams.get("owner") ?? undefined,
    status: searchParams.get("status") ?? undefined
  });

  return NextResponse.json(objectives);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const objective = createObjective(body);
    return NextResponse.json(objective, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create objective.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

