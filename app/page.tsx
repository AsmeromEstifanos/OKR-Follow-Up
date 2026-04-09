import DashboardObjectiveControls from "@/app/dashboard-objective-controls";
import DashboardPositionControls from "@/app/dashboard-position-controls";
import DashboardPositionRowControls from "@/app/dashboard-position-row-controls";
import DashboardObjectiveRowEditor from "@/app/dashboard-objective-row-editor";
import DashboardVentureTabs from "@/app/dashboard-venture-tabs";
import { objectiveBelongsToVenture } from "@/lib/objective-scope";
import {
  getConfig,
  listAdminEmails,
  listCheckIns,
  listKeyResults,
  listObjectives,
  listPeriods,
} from "@/lib/store";
import type { CheckIn, Objective, OkrCycle, Venture } from "@/lib/types";
import { Fragment, type CSSProperties } from "react";

export const dynamic = "force-dynamic";

type OwnerSection = {
  positionName: string;
  positionKey?: string;
  positionOwner?: string;
  positionOwnerEmail?: string;
  objectives: Objective[];
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

const GROUP_COLORS = [
  "#2b6de0",
  "#00a76f",
  "#cc3fa0",
  "#ff9f1a",
  "#00a9c9",
  "#7846f8",
];

function getSearchParamValue(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

async function resolveSearchParams(
  searchParams: DashboardPageProps["searchParams"],
): Promise<{ ventureKey?: string | string[] }> {
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

function getMostRecentTimestamp(
  primary: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  const candidates = [primary, fallback]
    .map((value) => (typeof value === "string" ? value : ""))
    .filter((value) => Boolean(value))
    .sort((left, right) => left.localeCompare(right));

  return candidates.at(-1) ?? null;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps): Promise<JSX.Element> {
  const resolvedSearchParams = await resolveSearchParams(searchParams);
  const config = await getConfig();
  const ventures = config.ventures;
  const fieldOptions = config.fieldOptions;
  const adminEmails = await listAdminEmails();
  if (ventures.length === 0) {
    return (
      <div className="dashboard-page">
        <DashboardVentureTabs
          ventures={ventures}
          selectedVentureKey={undefined}
          adminEmails={adminEmails}
        />
        <section className="section">
          <p className="meta">No ventures configured.</p>
        </section>
      </div>
    );
  }
  const periods = await listPeriods();
  const defaultPeriod =
    periods.find((period) => period.status === "Active") ?? periods[0];
  const defaultCycle = defaultPeriod
    ? getCycleFromDate(defaultPeriod.startDate)
    : "Q1";
  const requestedVentureKey = getSearchParamValue(
    resolvedSearchParams?.ventureKey,
  )?.trim();
  const selectedVenture = requestedVentureKey
    ? (ventures.find(
        (venture) =>
          venture.ventureKey.toLowerCase() ===
          requestedVentureKey.toLowerCase(),
      ) ?? ventures[0])
    : ventures[0];

  const allObjectives = (await listObjectives()).filter((objective) => {
    if (!selectedVenture) {
      return true;
    }

    return objectiveBelongsToVenture(objective, selectedVenture);
  });

  const objectiveKeys = new Set(
    allObjectives.map((objective) => objective.objectiveKey.toLowerCase()),
  );
  const allKeyResults = (await listKeyResults()).filter((kr) =>
    objectiveKeys.has(kr.objectiveKey.toLowerCase()),
  );

  const latestCheckinByKr = (await listCheckIns()).reduce<Map<string, CheckIn>>(
    (map, checkIn) => {
      if (!map.has(checkIn.krKey)) {
        map.set(checkIn.krKey, checkIn);
      }

      return map;
    },
    new Map(),
  );

  const keyResultsByObjective = allKeyResults.reduce<
    Map<string, typeof allKeyResults>
  >((map, kr) => {
    const current = map.get(kr.objectiveKey) ?? [];
    current.push(kr);
    map.set(kr.objectiveKey, current);
    return map;
  }, new Map());
  const objectivesByPosition = allObjectives.reduce<Map<string, Objective[]>>(
    (map, objective) => {
      const key = objective.department.toLowerCase();
      const current = map.get(key) ?? [];
      current.push(objective);
      map.set(key, current);
      return map;
    },
    new Map(),
  );

  const configuredPositions =
    selectedVenture?.departments.map((department) => department.name) ?? [];
  const configuredPositionByName = new Map(
    (selectedVenture?.departments ?? []).map(
      (department) =>
        [
          department.name.toLowerCase(),
          {
            departmentKey: department.departmentKey,
            owner: department.owner,
            ownerEmail: department.ownerEmail,
          },
        ] as const,
    ),
  );
  const objectivePositions = Array.from(
    new Set(allObjectives.map((objective) => objective.department)),
  );
  const orderedPositions = [...configuredPositions];

  objectivePositions.forEach((position) => {
    if (
      orderedPositions.some(
        (item) => item.toLowerCase() === position.toLowerCase(),
      )
    ) {
      return;
    }

    orderedPositions.push(position);
  });

  const ownerSections = orderedPositions.map<OwnerSection>((positionName) => {
    return {
      positionName,
      positionKey: configuredPositionByName.get(positionName.toLowerCase())
        ?.departmentKey,
      positionOwner: configuredPositionByName.get(positionName.toLowerCase())
        ?.owner,
      positionOwnerEmail: configuredPositionByName.get(
        positionName.toLowerCase(),
      )?.ownerEmail,
      objectives: objectivesByPosition.get(positionName.toLowerCase()) ?? [],
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
        <div className="section-header">
          <div className="section-header-left">
            <h2>OKR Board View</h2>
            <DashboardPositionControls
              selectedVentureKey={selectedVenture?.ventureKey}
              existingPositionNames={configuredPositions}
              adminEmails={adminEmails}
            />
          </div>
        </div>
        {ownerSections.length === 0 ? (
          <p className="meta">No objectives available.</p>
        ) : (
          <div className="board-groups">
            {ownerSections.map((section, sectionIndex) => {
              const sectionStyle = {
                "--group-color":
                  GROUP_COLORS[sectionIndex % GROUP_COLORS.length],
              } as CSSProperties;
              const positionScopeKey = [
                selectedVenture?.ventureKey ?? "default",
                section.positionKey ?? section.positionName,
              ].join("::");

              return (
                <section
                  className="board-group"
                  key={positionScopeKey}
                  style={sectionStyle}
                >
                  <DashboardPositionRowControls
                    key={`${positionScopeKey}::position`}
                    selectedVentureKey={selectedVenture?.ventureKey}
                    departmentKey={section.positionKey}
                    positionName={section.positionName}
                    positionOwner={section.positionOwner}
                    positionOwnerEmail={section.positionOwnerEmail}
                    objectiveCount={section.objectives.length}
                    adminEmails={adminEmails}
                  >
                    <div className="board-group-title-wrap">
                      <div className="board-group-title-row">
                        <DashboardObjectiveControls
                          key={`${positionScopeKey}::objectives`}
                          positionName={section.positionName}
                          strategicTheme={selectedVenture?.name ?? "SVH"}
                          defaultPeriodKey={defaultPeriod?.periodKey}
                          defaultStartDate={defaultPeriod?.startDate}
                          defaultEndDate={defaultPeriod?.endDate}
                          defaultCycle={defaultCycle}
                          defaultOwner=""
                          positionOwnerEmail={section.positionOwnerEmail}
                          adminEmails={adminEmails}
                          objectiveTypeOptions={fieldOptions.objectiveTypes}
                          objectiveStatusOptions={
                            fieldOptions.objectiveStatuses
                          }
                          objectiveCycleOptions={fieldOptions.objectiveCycles}
                        />
                      </div>
                    </div>
                    <div className="table-wrap">
                      <table className="board-table">
                        <thead>
                          <tr>
                            <th>Objective</th>
                            <th>Owner</th>
                            <th>Objective Type</th>
                            <th>Health</th>
                            <th>RAG</th>
                            <th>Progress %</th>
                            <th>OKR Cycle</th>
                            <th>Blockers</th>
                            <th>Key Risks/Dependancy</th>
                            <th>Notes</th>
                            <th>Last updated</th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.objectives.length === 0 ? (
                            <tr className="board-empty-row">
                              <td colSpan={11}>
                                No objectives yet for this position.
                              </td>
                            </tr>
                          ) : (
                            section.objectives.map((objective) => {
                              const keyResults =
                                keyResultsByObjective.get(
                                  objective.objectiveKey,
                                ) ?? [];
                              return (
                                <Fragment key={objective.objectiveKey}>
                                  <DashboardObjectiveRowEditor
                                    objective={objective}
                                    keyResults={keyResults.map((kr) => {
                                      const latest = latestCheckinByKr.get(
                                        kr.krKey,
                                      );
                                      return {
                                        keyResult: kr,
                                        latestUpdateNotes: latest?.updateNotes,
                                        latestUpdatedAt: getMostRecentTimestamp(
                                          latest?.checkInAt,
                                          kr.lastCheckinAt,
                                        ),
                                      };
                                    })}
                                    positionOwnerEmail={
                                      section.positionOwnerEmail
                                    }
                                    adminEmails={adminEmails}
                                    objectiveTypeOptions={
                                      fieldOptions.objectiveTypes
                                    }
                                    objectiveStatusOptions={
                                      fieldOptions.objectiveStatuses
                                    }
                                    objectiveCycleOptions={
                                      fieldOptions.objectiveCycles
                                    }
                                    metricTypeOptions={
                                      fieldOptions.keyResultMetricTypes
                                    }
                                    keyResultStatusOptions={
                                      fieldOptions.keyResultStatuses
                                    }
                                    checkInFrequencyOptions={
                                      fieldOptions.checkInFrequencies
                                    }
                                  />
                                </Fragment>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </DashboardPositionRowControls>
                </section>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
