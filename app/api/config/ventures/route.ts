import { addVenture, getConfig } from "@/lib/dummy-store";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(getConfig().ventures);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await request.json();
    const venture = addVenture(payload);
    return NextResponse.json(venture, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add venture.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

