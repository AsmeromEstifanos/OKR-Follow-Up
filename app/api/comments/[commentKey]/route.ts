import { deleteComment } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Props = {
  params: { commentKey: string };
};

export async function DELETE(_request: NextRequest, { params }: Props): Promise<NextResponse> {
  try {
    const deleted = await deleteComment(decodeURIComponent(params.commentKey));
    if (!deleted) {
      return NextResponse.json({ error: "Comment not found." }, { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete comment.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
