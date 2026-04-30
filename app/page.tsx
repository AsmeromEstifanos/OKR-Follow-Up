import DashboardPositionControls from "@/app/dashboard-position-controls";
import DashboardVentureTabs from "@/app/dashboard-venture-tabs";
import OkrBoard from "@/app/okr-board";
import { objectiveBelongsToVenture } from "@/lib/objective-scope";
import {
  getConfig,
  listAdminEmails,
  listCheckIns,
  listKeyResults,
  listMilestones,
  listObjectives,
  listPeriods
} from "@/lib/store";
import type { CheckIn, KeyResult, Milestone, Objective, OkrCycle } from "@/lib/types";

export const dynamic = "force-dynamic";

type OwnerSection = {
  positionName: string;
  positionKey?: string;
  positionOwner?: string;
  positionOwnerEmail?: string;
  objectives: Array<{
    objective: Objective;
    keyResults: Array<{
      keyResult: KeyResult;
      latestUpdateNotes?: string;
      latestUpdatedAt?: string | null;
      milestones: Milestone[];
    }>;
  }>;
};

type DashboardPageProps = {
  searchParams?:
    | {
        ventureKey?: string | string[];
      }
    | Promise<{
        ventureKey?: string | string[];
      }>;
};

const GROUP_COLORS = ["#2b6de0", "#00a76f", "#cc3fa0", "#ff9f1a", "#00a9c9", "#7846f8"];

function getSearchParamValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

async function resolveSearchParams(searchParams: DashboardPageProps["searchParams"]): Promise<{ ventureKey?: string | string[] }> {
  if (!searchParams) {
    return {};
  }

  if ("then" in searchParams) {
    return searchParams;
  }

  return searchParams;
}

function getCycleFromDate(value: string): OkrCycle {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Q1";
  }

  const quarter = Math.floor(date.getMonth() / 3) + 1;
  if (quarter === 1) {
    return "Q1";
  }

  if (quarter === 2) {
    return "Q2";
  }

  if (quarter === 3) {
    return "Q3";
  }

  return "Q4";
}

function getMostRecentTimestamp(primary: string | null | undefined, fallback: string | null | undefined): string | null {
  const candidates = [primary, fallback]
    .map((value) => (typeof value === "string" ? value : ""))
    .filter((value) => Boolean(value))
    .sort((left, right) => left.localeCompare(right));

  return candidates.at(-1) ?? null;
}

export default async function DashboardPage({
  searchParams
}: DashboardPageProps): Promise<JSX.Element> {
  const resolvedSearchParams = await resolveSearchParams(searchParams);
  const config = await getConfig();
  const ventures = config.ventures;
  const fieldOptions = config.fieldOptions;
  const adminEmails = await listAdminEmails();

  if (ventures.length === 0) {
    return (
      <div className="dashboard-page">
        <DashboardVentureTabs ventures={ventures} selectedVentureKey={undefined} adminEmails={adminEmails} />
        <section className="section">
          <p className="meta">No ventures configured.</p>
        </section>
      </div>
    );
  }

  const periods = await listPeriods();
  const defaultPeriod = periods.find((period) => period.status === "Active") ?? periods[0];
  const defaultCycle = defaultPeriod ? getCycleFromDate(defaultPeriod.startDate) : "Q1";
  const requestedVentureKey = getSearchParamValue(resolvedSearchParams?.ventureKey)?.trim();
  const selectedVenture = requestedVentureKey
    ? (ventures.find((venture) => venture.ventureKey.toLowerCase() === requestedVentureKey.toLowerCase()) ?? ventures[0])
    : ventures[0];

  const allObjectives = (await listObjectives()).filter((objective) => {
    if (!selectedVenture) {
      return true;
    }

    return objectiveBelongsToVenture(objective, selectedVenture);
  });

  const objectiveKeys = new Set(allObjectives.map((objective) => objective.objectiveKey.toLowerCase()));
  const allKeyResults = (await listKeyResults()).filter((kr) => objectiveKeys.has(kr.objectiveKey.toLowerCase()));
  const milestonesByKr = (await listMilestones()).reduce<Map<string, Milestone[]>>((map, milestone) => {
    const current = map.get(milestone.krKey) ?? [];
    current.push(milestone);
    map.set(milestone.krKey, current);
    return map;
  }, new Map());
  const latestCheckinByKr = (await listCheckIns()).reduce<Map<string, CheckIn>>((map, checkIn) => {
    if (!map.has(checkIn.krKey)) {
      map.set(checkIn.krKey, checkIn);
    }

    return map;
  }, new Map());

  const keyResultsByObjective = allKeyResults.reduce<Map<string, KeyResult[]>>((map, kr) => {
    const current = map.get(kr.objectiveKey) ?? [];
    current.push(kr);
    map.set(kr.objectiveKey, current);
    return map;
  }, new Map());

  const objectivesByPosition = allObjectives.reduce<Map<string, Objective[]>>((map, objective) => {
    const key = objective.department.toLowerCase();
    const current = map.get(key) ?? [];
    current.push(objective);
    map.set(key, current);
    return map;
  }, new Map());

  const configuredPositions = selectedVenture?.departments.map((department) => department.name) ?? [];
  const configuredPositionByName = new Map(
    (selectedVenture?.departments ?? []).map(
      (department) =>
        [
          department.name.toLowerCase(),
          {
            departmentKey: department.departmentKey,
            owner: department.owner,
            ownerEmail: department.ownerEmail
          }
        ] as const
    )
  );
  const objectivePositions = Array.from(new Set(allObjectives.map((objective) => objective.department)));
  const orderedPositions = [...configuredPositions];

  objectivePositions.forEach((position) => {
    if (orderedPositions.some((item) => item.toLowerCase() === position.toLowerCase())) {
      return;
    }

    orderedPositions.push(position);
  });

  const ownerSections = orderedPositions.map<OwnerSection>((positionName) => {
    const objectives = objectivesByPosition.get(positionName.toLowerCase()) ?? [];

    return {
      positionName,
      positionKey: configuredPositionByName.get(positionName.toLowerCase())?.departmentKey,
      positionOwner: configuredPositionByName.get(positionName.toLowerCase())?.owner,
      positionOwnerEmail: configuredPositionByName.get(positionName.toLowerCase())?.ownerEmail,
      objectives: objectives.map((objective) => {
        const keyResults = keyResultsByObjective.get(objective.objectiveKey) ?? [];

        return {
          objective,
          keyResults: keyResults.map((kr) => {
            const latest = latestCheckinByKr.get(kr.krKey);
            return {
              keyResult: kr,
              latestUpdateNotes: latest?.updateNotes,
              latestUpdatedAt: getMostRecentTimestamp(latest?.checkInAt, kr.lastCheckinAt),
              milestones: (milestonesByKr.get(kr.krKey) ?? []).sort((left, right) => left.sequence - right.sequence)
            };
          })
        };
      })
    };
  });

  return (
    <div className="dashboard-page">
      <DashboardVentureTabs
        ventures={ventures}
        selectedVentureKey={selectedVenture?.ventureKey}
        adminEmails={adminEmails}
      />

      <section className="section">
        <OkrBoard
          selectedVentureKey={selectedVenture?.ventureKey}
          selectedVentureName={selectedVenture?.name ?? "SVH"}
          ownerSections={ownerSections}
          adminEmails={adminEmails}
          positionControls={
            <DashboardPositionControls
              selectedVentureKey={selectedVenture?.ventureKey}
              existingPositionNames={configuredPositions}
              adminEmails={adminEmails}
            />
          }
          defaultPeriodKey={defaultPeriod?.periodKey}
          defaultStartDate={defaultPeriod?.startDate}
          defaultEndDate={defaultPeriod?.endDate}
          defaultCycle={defaultCycle}
          objectiveTypeOptions={fieldOptions.objectiveTypes}
          objectiveStatusOptions={fieldOptions.objectiveStatuses}
          objectiveCycleOptions={fieldOptions.objectiveCycles}
          metricTypeOptions={fieldOptions.keyResultMetricTypes}
          keyResultStatusOptions={fieldOptions.keyResultStatuses}
          checkInFrequencyOptions={fieldOptions.checkInFrequencies}
          groupColors={GROUP_COLORS}
        />
      </section>
    </div>
  );
}
