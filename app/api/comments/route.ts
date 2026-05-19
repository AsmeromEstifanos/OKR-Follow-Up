import { createComment, getComments } from "@/lib/store";
import { sendMentionNotifications } from "@/lib/notifications";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const entityType = searchParams.get("entityType");
  const entityKey = searchParams.get("entityKey");

  if (!entityType || !entityKey) {
    return NextResponse.json({ error: "entityType and entityKey are required." }, { status: 400 });
  }

  const comments = await getComments(entityType, entityKey);
  return NextResponse.json(comments);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const comment = await createComment(body);

    const mentionedEmails: string[] = Array.isArray(body.mentionedEmails) ? body.mentionedEmails : [];
    if (mentionedEmails.length > 0) {
      try {
        await sendMentionNotifications({
          mentionedEmails,
          authorEmail: body.authorEmail ?? "",
          authorName: body.authorName ?? body.authorEmail ?? "",
          messageBody: body.body ?? "",
          entityType: body.entityType ?? "",
          entityKey: body.entityKey ?? "",
          entityTitle: body.entityTitle ?? ""
        });
      } catch (err: unknown) {
        console.error("[mention-notify]", err instanceof Error ? err.message : err);
      }
    }

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create comment.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
