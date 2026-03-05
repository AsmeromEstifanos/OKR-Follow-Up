import { addVenture, getConfig } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const config = await getConfig();
  return NextResponse.json(config.ventures);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await request.json();
    const venture = await addVenture(payload);
    return NextResponse.json(venture, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add venture.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
