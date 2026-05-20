import { getActivityLogPage, getUserRole } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Period shorthands → date range helpers
function periodToRange(period: string): { from: string; to: string } | null {
  const now = new Date();

  if (period === "today") {
    const d = now.toISOString().slice(0, 10);
    return { from: `${d}T00:00:00.000Z`, to: `${d}T23:59:59.999Z` };
  }

  if (period === "week") {
    const start = new Date(now);
    start.setUTCDate(now.getUTCDate() - 6);
    return { from: start.toISOString().slice(0, 10) + "T00:00:00.000Z", to: now.toISOString() };
  }

  if (period === "month") {
    const start = new Date(now);
    start.setUTCDate(now.getUTCDate() - 29);
    return { from: start.toISOString().slice(0, 10) + "T00:00:00.000Z", to: now.toISOString() };
  }

  if (period === "quarter") {
    const start = new Date(now);
    start.setUTCDate(now.getUTCDate() - 89);
    return { from: start.toISOString().slice(0, 10) + "T00:00:00.000Z", to: now.toISOString() };
  }

  if (period === "year") {
    const start = new Date(now);
    start.setUTCFullYear(now.getUTCFullYear() - 1);
    return { from: start.toISOString().slice(0, 10) + "T00:00:00.000Z", to: now.toISOString() };
  }

  return null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userEmail = (request.headers.get("x-user-email") ?? "").trim().toLowerCase();
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const role = await getUserRole(userEmail);
  if (!role || (role !== "Admin" && role !== "Manager")) {
    return NextResponse.json({ error: "Forbidden. Requires Manager or Admin role." }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const period = sp.get("period") ?? "";
  const entityType = sp.get("entityType") ?? undefined;
  const filterUserEmail = sp.get("userEmail") ?? undefined;
  const limitRaw = sp.get("limit");
  const cursor = sp.get("cursor") ?? undefined;

  let from = sp.get("from") ?? undefined;
  let to = sp.get("to") ?? undefined;

  if (period) {
    const range = periodToRange(period);
    if (range) {
      from = range.from;
      to = range.to;
    }
  }

  const limit = limitRaw ? Math.min(Math.max(1, parseInt(limitRaw, 10) || 50), 200) : 50;

  const page = await getActivityLogPage({
    entityType,
    userEmail: filterUserEmail,
    from,
    to,
    limit,
    cursor
  });

  return NextResponse.json(page);
}
