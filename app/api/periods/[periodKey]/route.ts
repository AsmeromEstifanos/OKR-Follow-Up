import { updatePeriod } from "@/lib/dummy-store";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = {
  params: {
    periodKey: string;
  };
};

export async function PATCH(request: NextRequest, context: Context): Promise<NextResponse> {
  try {
    const patch = await request.json();
    const period = updatePeriod(context.params.periodKey, patch);

    if (!period) {
      return NextResponse.json({ error: "Period not found." }, { status: 404 });
    }

    return NextResponse.json(period);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update period.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
