import { getCommentCounts, listKeyResults, listObjectives } from "@/lib/store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type EnrichedCount = {
  count: number;
  latestAt: string;
  latestBody: string;
  latestAuthor: string;
  entityType: "objective" | "kr";
  entityKey: string;
  title: string;
  code: string;
  department?: string;
  parentObjectiveCode?: string;
  timestamps: string[];
};

export async function GET(): Promise<NextResponse> {
  const [counts, objectives, krs] = await Promise.all([
    getCommentCounts(),
    listObjectives({}),
    listKeyResults({})
  ]);

  const objectiveByKey = new Map(objectives.map((o) => [o.objectiveKey, o]));
  const krByKey = new Map(krs.map((k) => [k.krKey, k]));

  const enriched: Record<string, EnrichedCount> = {};
  for (const [id, base] of Object.entries(counts)) {
    const [entityType, entityKey] = id.split("::");
    if (entityType !== "objective" && entityType !== "kr") continue;

    let title = entityKey;
    let code = entityKey;
    let department: string | undefined;
    let parentObjectiveCode: string | undefined;

    if (entityType === "objective") {
      const obj = objectiveByKey.get(entityKey);
      if (obj) {
        title = obj.title;
        code = obj.objectiveCode ?? obj.objectiveKey;
        department = obj.department;
      }
    } else {
      const kr = krByKey.get(entityKey);
      if (kr) {
        title = kr.title;
        code = kr.krCode ?? kr.krKey;
        const parentObj = objectiveByKey.get(kr.objectiveKey);
        if (parentObj) {
          parentObjectiveCode = parentObj.objectiveCode ?? parentObj.objectiveKey;
          department = parentObj.department;
        }
      }
    }

    enriched[id] = {
      count: base.count,
      latestAt: base.latestAt,
      latestBody: base.latestBody,
      latestAuthor: base.latestAuthor,
      entityType,
      entityKey,
      title,
      code,
      department,
      parentObjectiveCode,
      timestamps: base.timestamps
    };
  }

  return NextResponse.json({ counts: enriched });
}
