import { deleteDepartmentFromVenture, updateDepartmentInVenture } from "@/lib/dummy-store";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = {
  params: {
    ventureKey: string;
    departmentKey: string;
  };
};

export async function PATCH(request: NextRequest, context: Context): Promise<NextResponse> {
  try {
    const payload = await request.json();
    const venture = updateDepartmentInVenture(context.params.ventureKey, context.params.departmentKey, payload);

    if (!venture) {
      return NextResponse.json({ error: "Venture or department not found." }, { status: 404 });
    }

    return NextResponse.json(venture);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update department.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, context: Context): Promise<NextResponse> {
  try {
    const venture = deleteDepartmentFromVenture(context.params.ventureKey, context.params.departmentKey);

    if (!venture) {
      return NextResponse.json({ error: "Venture or department not found." }, { status: 404 });
    }

    return NextResponse.json(venture);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete department.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
