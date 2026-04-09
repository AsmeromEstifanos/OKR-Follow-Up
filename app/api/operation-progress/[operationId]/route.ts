import { getOperationProgress } from "@/lib/operation-progress";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = {
  params: {
    operationId: string;
  };
};

export async function GET(_request: Request, context: Context): Promise<NextResponse> {
  const operationId = (context.params.operationId ?? "").trim();
  if (!operationId) {
    return NextResponse.json({ error: "Operation not found." }, { status: 404 });
  }

  const progress = getOperationProgress(operationId);
  if (!progress) {
    return NextResponse.json({ error: "Operation not found." }, { status: 404 });
  }

  return NextResponse.json(progress);
}
