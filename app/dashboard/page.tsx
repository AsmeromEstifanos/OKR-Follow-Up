import DashboardFilters from "@/app/dashboard-filters";
import DashboardTabs from "@/app/dashboard-tabs";
import { objectiveBelongsToVenture } from "@/lib/objective-scope";
import { resolveOwnerEmail } from "@/lib/owner";
import { getConfig, listKeyResults, listMilestones, listObjectives } from "@/lib/store";
import type { Objective } from "@/lib/types";

export const dynamic = "force-dynamic";

type DashboardAnalyticsPageProps = {
  searchParams?:
    | {
        ventureKey?: string | string[];
        department?: string | string[];
        view?: string | string[];
      }
    | Promise<{
        ventureKey?: string | string[];
        department?: string | string[];
        view?: string | string[];
      }>;
};

type DashboardView = "overview" | "department" | "objective";

type ObjectiveCardRow = {
  objective: Objective;
  keyResultCount: number;
  milestoneCount: number;
  blockers: string[];
  keyResultOwnerEmails: string[];
};

type DepartmentObjectiveGroup = {
  ventureName: string;
  departmentName: string;
  objectives: ObjectiveCardRow[];
};

function getSearchParamValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

async function resolveSearchParams(
  searchParams: DashboardAnalyticsPageProps["searchParams"]
): Promise<{ ventureKey?: string | string[]; department?: string | string[]; view?: string | string[] }> {
  if (!searchParams) {
    return {};
  }

  if ("then" in searchParams) {
    return searchParams;
  }

  return searchParams;
}

function normalizeDashboardView(value: string | undefined): DashboardView {
  if (value === "department" || value === "objective") {
    return value;
  }

  return "overview";
}

export default async function DashboardAnalyticsPage({
  searchParams
}: DashboardAnalyticsPageProps): Promise<JSX.Element> {
  const resolvedSearchParams = await resolveSearchParams(searchParams);
  const requestedVentureKey = getSearchParamValue(resolvedSearchParams?.ventureKey)?.trim();
  const selectedDepartment = getSearchParamValue(resolvedSearchParams?.department)?.trim() ?? "";
  const selectedView = normalizeDashboardView(getSearchParamValue(resolvedSearchParams?.view)?.trim());

  const config = await getConfig();
  const ventures = config.ventures;
  const selectedVenture = requestedVentureKey
    ? ventures.find((venture) => venture.ventureKey.toLowerCase() === requestedVentureKey.toLowerCase())
    : undefined;

  const allObjectives = await listObjectives();
  const allKeyResults = await listKeyResults();
  const allMilestones = await listMilestones();

  const filteredObjectives = allObjectives.filter((objective) => {
    if (selectedVenture && !objectiveBelongsToVenture(objective, selectedVenture)) {
      return false;
    }

    if (selectedDepartment && objective.department.toLowerCase() !== selectedDepartment.toLowerCase()) {
      return false;
    }

    return true;
  });

  const objectiveKeys = new Set(filteredObjectives.map((objective) => objective.objectiveKey.toLowerCase()));
  const filteredKeyResults = allKeyResults.filter((keyResult) => objectiveKeys.has(keyResult.objectiveKey.toLowerCase()));
  const keyResultsByObjective = filteredKeyResults.reduce<Map<string, typeof filteredKeyResults>>((map, keyResult) => {
    const current = map.get(keyResult.objectiveKey.toLowerCase()) ?? [];
    current.push(keyResult);
    map.set(keyResult.objectiveKey.toLowerCase(), current);
    return map;
  }, new Map());
  const milestoneCountByKr = allMilestones.reduce<Map<string, number>>((map, milestone) => {
    const key = milestone.krKey.toLowerCase();
    map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map());

  const objectiveGroups = ventures
    .flatMap<DepartmentObjectiveGroup>((venture) =>
      venture.departments.map((department) => {
        const objectives = filteredObjectives
          .filter((objective) => {
            return (
              objective.department.toLowerCase() === department.name.toLowerCase() &&
              objectiveBelongsToVenture(objective, venture)
            );
          })
          .map<ObjectiveCardRow>((objective) => {
            const keyResults = keyResultsByObjective.get(objective.objectiveKey.toLowerCase()) ?? [];
            const blockers = Array.from(
              new Set(
                [objective.blockers ?? "", ...keyResults.map((keyResult) => keyResult.blockers ?? "")]
                  .map((value) => value.trim())
                  .filter((value) => Boolean(value))
              )
            );
            const milestoneCount = keyResults.reduce((sum, keyResult) => {
              return sum + (milestoneCountByKr.get(keyResult.krKey.toLowerCase()) ?? 0);
            }, 0);

            return {
              objective,
              keyResultCount: keyResults.length,
              milestoneCount,
              blockers,
              keyResultOwnerEmails: keyResults.map((keyResult) => resolveOwnerEmail(keyResult.owner, keyResult.ownerEmail))
            };
          });

        return {
          ventureName: venture.name,
          departmentName: department.name,
          objectives
        };
      })
    )
    .filter((group) => {
      if (selectedVenture && group.ventureName.toLowerCase() !== selectedVenture.name.toLowerCase()) {
        return false;
      }

      if (selectedDepartment) {
        return group.departmentName.toLowerCase() === selectedDepartment.toLowerCase();
      }

      return group.objectives.length > 0;
    });

  const scopeLabel = selectedVenture
    ? selectedDepartment
      ? `${selectedVenture.name} / ${selectedDepartment}`
      : selectedVenture.name
    : selectedDepartment
      ? selectedDepartment
      : "All ventures and departments";

  return (
    <div className="dashboard-page analytics-page">
      <DashboardFilters
        ventures={ventures}
        selectedVentureKey={selectedVenture?.ventureKey}
        selectedDepartment={selectedDepartment}
      />

      <section className="section analytics-overview">
        <DashboardTabs initialView={selectedView} scopeLabel={scopeLabel} objectiveGroups={objectiveGroups} />
      </section>
    </div>
  );
}
