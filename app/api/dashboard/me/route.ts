import { DEMO_OWNER, getDashboardForOwner } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const owner = request.nextUrl.searchParams.get("owner") ?? DEMO_OWNER;
  const ventureKey = request.nextUrl.searchParams.get("ventureKey") ?? undefined;
  const department = request.nextUrl.searchParams.get("department") ?? undefined;
  const dashboard = await getDashboardForOwner(owner, { ventureKey, department });
  return NextResponse.json(dashboard);
}
