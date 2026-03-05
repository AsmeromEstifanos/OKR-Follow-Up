import { previewNextObjectiveCode } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const department = searchParams.get("department")?.trim() ?? "";
  const ventureName = searchParams.get("ventureName")?.trim() ?? "";
  const strategicTheme = searchParams.get("strategicTheme")?.trim() ?? "";

  if (!department) {
    return NextResponse.json({ error: "department is required." }, { status: 400 });
  }

  const code = await previewNextObjectiveCode(department, ventureName, strategicTheme);
  return NextResponse.json({ code });
}

