import { getCommentCounts } from "@/lib/store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const counts = await getCommentCounts();
  return NextResponse.json({ counts });
}
