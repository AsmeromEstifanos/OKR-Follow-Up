import { getCommentCounts, listKeyResults, listObjectives } from "@/lib/store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type EnrichedCount = {
  count: number;
  latestAt: string;
  entityType: "objective" | "kr";
  entityKey: string;
  title: string;
};

export async function GET(): Promise<NextResponse> {
  const [counts, objectives, krs] = await Promise.all([
    getCommentCounts(),
    listObjectives({}),
    listKeyResults({})
  ]);

  const titleByObjective = new Map(objectives.map((o) => [o.objectiveKey, o.title]));
  const titleByKr = new Map(krs.map((k) => [k.krKey, k.title]));

  const enriched: Record<string, EnrichedCount> = {};
  for (const [id, base] of Object.entries(counts)) {
    const [entityType, entityKey] = id.split("::");
    if (entityType !== "objective" && entityType !== "kr") continue;

    const title =
      (entityType === "objective" ? titleByObjective.get(entityKey) : titleByKr.get(entityKey)) ?? entityKey;

    enriched[id] = {
      count: base.count,
      latestAt: base.latestAt,
      entityType: entityType,
      entityKey,
      title
    };
  }

  return NextResponse.json({ counts: enriched });
}
