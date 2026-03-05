import { setupSharePointStorage } from "@/lib/store";
import { getSharePointStorageStatus } from "@/lib/sharepoint/server-storage";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(getSharePointStorageStatus());
}

export async function POST(): Promise<NextResponse> {
  try {
    const status = await setupSharePointStorage();
    return NextResponse.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to setup SharePoint storage.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
