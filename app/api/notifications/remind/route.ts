import { requireAdmin } from "@/app/api/_utils/admin-guard";
import { listKeyResults, listObjectives, listPeriods } from "@/lib/store";
import { sendAtRiskAlerts, sendMissingCheckInReminders } from "@/lib/notifications";
import { isMissingCheckin } from "@/lib/okr-rules";
import type { KeyResult, Objective } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guardResult = await requireAdmin(request);
  if (guardResult) {
    return guardResult;
  }

  const periods = await listPeriods();
  const periodMap = new Map(periods.map((p) => [p.periodKey, p]));

  const [allKrs, allObjectives] = await Promise.all([
    listKeyResults({}),
    listObjectives({})
  ]);

  const missingKrs = allKrs.filter((kr) => {
    const period = periodMap.get(kr.periodKey);
    return period ? isMissingCheckin(kr.lastCheckinAt, period.status) : false;
  });

  const atRiskObjectives = allObjectives.filter((obj) => {
    const period = periodMap.get(obj.periodKey);
    return period?.status === "Active" && (obj.rag === "Red" || obj.rag === "Amber");
  });

  const krsByOwner = new Map<string, KeyResult[]>();
  for (const kr of missingKrs) {
    const email = (kr.ownerEmail ?? "").trim().toLowerCase();
    if (!email) continue;
    const list = krsByOwner.get(email) ?? [];
    list.push(kr);
    krsByOwner.set(email, list);
  }

  const objectivesByOwner = new Map<string, Objective[]>();
  for (const obj of atRiskObjectives) {
    const email = (obj.ownerEmail ?? "").trim().toLowerCase();
    if (!email) continue;
    const list = objectivesByOwner.get(email) ?? [];
    list.push(obj);
    objectivesByOwner.set(email, list);
  }

  const [checkInResult, atRiskResult] = await Promise.all([
    sendMissingCheckInReminders(krsByOwner),
    sendAtRiskAlerts(objectivesByOwner)
  ]);

  return NextResponse.json({
    missingCheckIns: {
      uniqueOwners: krsByOwner.size,
      totalKrs: missingKrs.length,
      ...checkInResult
    },
    atRiskAlerts: {
      uniqueOwners: objectivesByOwner.size,
      totalObjectives: atRiskObjectives.length,
      ...atRiskResult
    }
  });
}
