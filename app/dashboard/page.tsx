import DashboardFilters from "@/app/dashboard-filters";
import { objectiveBelongsToVenture } from "@/lib/objective-scope";
import { getConfig, listKeyResults, listObjectives } from "@/lib/store";
import type { Objective, ObjectiveStatus, Venture } from "@/lib/types";
import { Fragment } from "react";

export const dynamic = "force-dynamic";

type DashboardAnalyticsPageProps = {
  searchParams?:
    | {
        ventureKey?: string | string[];
        department?: string | string[];
      }
    | Promise<{
        ventureKey?: string | string[];
        department?: string | string[];
      }>;
};

type Summary = {
  objectiveCount: number;
  keyResultCount: number;
  statusCounts: Record<string, number>;
  avgProgress: number;
};

type KrSummary = {
  keyResultCount: number;
  statusCounts: Record<string, number>;
  avgProgress: number;
};

type VentureRow = {
  ventureKey: string;
  ventureName: string;
  objectiveSummary: Summary;
  krSummary: KrSummary;
};

type DepartmentRow = {
  ventureName: string;
  departmentName: string;
  objectiveSummary: Summary;
  krSummary: KrSummary;
};

function getSearchParamValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

async function resolveSearchParams(
  searchParams: DashboardAnalyticsPageProps["searchParams"]
): Promise<{ ventureKey?: string | string[]; department?: string | string[] }> {
  if (!searchParams) {
    return {};
  }

  if ("then" in searchParams) {
    return searchParams;
  }

  return searchParams;
}

function computeSummary(objectives: Objective[], keyResultCountByObjective: Map<string, number>): Summary {
  const objectiveCount = objectives.length;
  const keyResultCount = objectives.reduce((total, objective) => {
    return total + (keyResultCountByObjective.get(objective.objectiveKey.toLowerCase()) ?? 0);
  }, 0);
  const statusCounts = objectives.reduce<Record<string, number>>((counts, objective) => {
    counts[objective.status] = (counts[objective.status] ?? 0) + 1;
    return counts;
  }, {});
  const avgProgress =
    objectiveCount > 0
      ? objectives.reduce((sum, objective) => sum + (Number.isFinite(objective.progressPct) ? objective.progressPct : 0), 0) / objectiveCount
      : 0;

  return {
    objectiveCount,
    keyResultCount,
    statusCounts,
    avgProgress
  };
}

function computeKrSummary(keyResults: Array<{ status: string; progressPct: number }>): KrSummary {
  const keyResultCount = keyResults.length;
  const statusCounts = keyResults.reduce<Record<string, number>>((counts, keyResult) => {
    counts[keyResult.status] = (counts[keyResult.status] ?? 0) + 1;
    return counts;
  }, {});
  const avgProgress =
    keyResultCount > 0
      ? keyResults.reduce((sum, keyResult) => sum + (Number.isFinite(keyResult.progressPct) ? keyResult.progressPct : 0), 0) / keyResultCount
      : 0;

  return {
    keyResultCount,
    statusCounts,
    avgProgress
  };
}

function formatStatus(value: ObjectiveStatus): string {
  if (value === "OnTrack") {
    return "On Track";
  }

  if (value === "AtRisk") {
    return "At Risk";
  }

  if (value === "OffTrack") {
    return "Off Track";
  }

  if (value === "NotStarted") {
    return "Not Started";
  }

  return value;
}

function toStatusClass(status: ObjectiveStatus): string {
  if (status === "OnTrack" || status === "Done") {
    return "analytics-status-ontrack";
  }

  if (status === "AtRisk") {
    return "analytics-status-atrisk";
  }

  if (status === "OffTrack") {
    return "analytics-status-offtrack";
  }

  return "analytics-status-notstarted";
}

function buildStatusCards<T extends { status: string }>(
  items: T[],
  statusOptions: string[]
): Array<{
  status: string;
  label: string;
  count: number;
  className: string;
}> {
  return statusOptions.map((statusOption) => ({
    status: statusOption,
    label: formatStatus(statusOption),
    count: items.filter((item) => item.status === statusOption).length,
    className: toStatusClass(statusOption)
  }));
}

function formatProgressPercent(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0%";
  }

  if (value < 1) {
    return `${value.toFixed(2)}%`;
  }

  if (value < 10) {
    return `${value.toFixed(1)}%`;
  }

  return `${Math.round(value)}%`;
}

export default async function DashboardAnalyticsPage({
  searchParams
}: DashboardAnalyticsPageProps): Promise<JSX.Element> {
  const resolvedSearchParams = await resolveSearchParams(searchParams);
  const requestedVentureKey = getSearchParamValue(resolvedSearchParams?.ventureKey)?.trim();
  const selectedDepartment = getSearchParamValue(resolvedSearchParams?.department)?.trim() ?? "";

  const config = await getConfig();
  const ventures = config.ventures;
  const selectedVenture = requestedVentureKey
    ? ventures.find((venture) => venture.ventureKey.toLowerCase() === requestedVentureKey.toLowerCase())
    : undefined;

  const allObjectives = await listObjectives();
  const allKeyResults = await listKeyResults();
  const keyResultCountByObjective = allKeyResults.reduce<Map<string, number>>((map, keyResult) => {
    const key = keyResult.objectiveKey.toLowerCase();
    map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map());

  const filteredObjectives = allObjectives.filter((objective) => {
    if (selectedVenture && !objectiveBelongsToVenture(objective, selectedVenture)) {
      return false;
    }

    if (selectedDepartment && objective.department.toLowerCase() !== selectedDepartment.toLowerCase()) {
      return false;
    }

    return true;
  });

  const summary = computeSummary(filteredObjectives, keyResultCountByObjective);
  const filteredObjectiveKeys = new Set(filteredObjectives.map((objective) => objective.objectiveKey.toLowerCase()));
  const filteredKeyResults = allKeyResults.filter((keyResult) => filteredObjectiveKeys.has(keyResult.objectiveKey.toLowerCase()));
  const krSummary = computeKrSummary(filteredKeyResults);
  const tableStatusColumns = Array.from(
    new Set([...config.fieldOptions.objectiveStatuses, ...config.fieldOptions.keyResultStatuses])
  );
  const objectiveStatusCards = buildStatusCards(filteredObjectives, config.fieldOptions.objectiveStatuses);
  const keyResultStatusCards = buildStatusCards(filteredKeyResults, config.fieldOptions.keyResultStatuses);

  const ventureRowsAll = ventures.map<VentureRow>((venture) => {
    const scopedObjectives = filteredObjectives.filter((objective) => objectiveBelongsToVenture(objective, venture));
    const scopedObjectiveKeys = new Set(scopedObjectives.map((objective) => objective.objectiveKey.toLowerCase()));
    const scopedKeyResults = filteredKeyResults.filter((keyResult) => scopedObjectiveKeys.has(keyResult.objectiveKey.toLowerCase()));
    return {
      ventureKey: venture.ventureKey,
      ventureName: venture.name,
      objectiveSummary: computeSummary(scopedObjectives, keyResultCountByObjective),
      krSummary: computeKrSummary(scopedKeyResults)
    };
  });
  const ventureRows = selectedVenture
    ? ventureRowsAll.filter((row) => row.ventureKey.toLowerCase() === selectedVenture.ventureKey.toLowerCase())
    : ventureRowsAll.filter((row) => row.objectiveSummary.objectiveCount > 0 || row.krSummary.keyResultCount > 0);

  const departmentRowsAll = ventures.flatMap<DepartmentRow>((venture) =>
    venture.departments.map((department) => {
      const scopedObjectives = filteredObjectives.filter((objective) => {
        return (
          objective.department.toLowerCase() === department.name.toLowerCase() && objectiveBelongsToVenture(objective, venture)
        );
      });
      const scopedObjectiveKeys = new Set(scopedObjectives.map((objective) => objective.objectiveKey.toLowerCase()));
      const scopedKeyResults = filteredKeyResults.filter((keyResult) => scopedObjectiveKeys.has(keyResult.objectiveKey.toLowerCase()));

      return {
        ventureName: venture.name,
        departmentName: department.name,
        objectiveSummary: computeSummary(scopedObjectives, keyResultCountByObjective),
        krSummary: computeKrSummary(scopedKeyResults)
      };
    })
  );
  const departmentRows = departmentRowsAll.filter((row) => {
    if (selectedVenture && row.ventureName.toLowerCase() !== selectedVenture.name.toLowerCase()) {
      return false;
    }

    if (selectedDepartment) {
      return row.departmentName.toLowerCase() === selectedDepartment.toLowerCase();
    }

    return row.objectiveSummary.objectiveCount > 0 || row.krSummary.keyResultCount > 0;
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
      <DashboardFilters ventures={ventures} selectedVentureKey={selectedVenture?.ventureKey} selectedDepartment={selectedDepartment} />

      <section className="section analytics-overview">
        <div className="section-header">
          <h2>OKR Dashboard</h2>
          <span className="meta">Scope: {scopeLabel}</span>
        </div>

        <div className="analytics-single-metric">
          <article className="analytics-summary-card analytics-summary-progress analytics-single-metric-card">
            <h3>Avg Progress</h3>
            <div className="analytics-summary-value">{formatProgressPercent(summary.avgProgress)}</div>
          </article>
        </div>

        <div className="section-header">
          <h3>Objective Progress</h3>
        </div>
        <div className="analytics-summary-grid">
          {objectiveStatusCards.map((card) => (
            <article key={card.status} className={`analytics-summary-card ${card.className}`}>
              <h3>{card.label}</h3>
              <div className="analytics-summary-value">{card.count}</div>
            </article>
          ))}
        </div>

        <p className="meta analytics-summary-meta">{summary.objectiveCount} objective(s)</p>
        <div className="section-header analytics-subsection-head">
          <h3>Key Result Progress</h3>
        </div>
        <div className="analytics-summary-grid">
          {keyResultStatusCards.map((card) => (
            <article key={card.status} className={`analytics-summary-card ${card.className}`}>
              <h3>{card.label}</h3>
              <div className="analytics-summary-value">{card.count}</div>
            </article>
          ))}
        </div>
        <p className="meta analytics-summary-meta">{krSummary.keyResultCount} key result(s)</p>
      </section>

      <section className="section">
        <div className="section-header">
          <h2>Venture Performance</h2>
        </div>
        <div className="table-wrap">
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Venture</th>
                <th>Metric</th>
                <th>Count</th>
                {tableStatusColumns.map((statusOption) => (
                  <th key={statusOption}>{formatStatus(statusOption)}</th>
                ))}
                <th>Avg Progress</th>
              </tr>
            </thead>
            <tbody>
              {ventureRows.length === 0 ? (
                <tr>
                  <td colSpan={tableStatusColumns.length + 4}>No venture data for the current filter.</td>
                </tr>
              ) : (
                ventureRows.map((row) => (
                  <Fragment key={row.ventureKey}>
                    <tr>
                      <td rowSpan={2}>{row.ventureName}</td>
                      <td>Objectives</td>
                      <td>{row.objectiveSummary.objectiveCount}</td>
                      {tableStatusColumns.map((statusOption) => (
                        <td key={statusOption}>{row.objectiveSummary.statusCounts[statusOption] ?? 0}</td>
                      ))}
                      <td>{formatProgressPercent(row.objectiveSummary.avgProgress)}</td>
                    </tr>
                    <tr>
                      <td>Key Results</td>
                      <td>{row.krSummary.keyResultCount}</td>
                      {tableStatusColumns.map((statusOption) => (
                        <td key={statusOption}>{row.krSummary.statusCounts[statusOption] ?? 0}</td>
                      ))}
                      <td>{formatProgressPercent(row.krSummary.avgProgress)}</td>
                    </tr>
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <h2>Department Performance</h2>
        </div>
        <div className="table-wrap">
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Department</th>
                <th>Venture</th>
                <th>Metric</th>
                <th>Count</th>
                {tableStatusColumns.map((statusOption) => (
                  <th key={statusOption}>{formatStatus(statusOption)}</th>
                ))}
                <th>Avg Progress</th>
              </tr>
            </thead>
            <tbody>
              {departmentRows.length === 0 ? (
                <tr>
                  <td colSpan={tableStatusColumns.length + 5}>No department data for the current filter.</td>
                </tr>
              ) : (
                departmentRows.map((row) => (
                  <Fragment key={`${row.ventureName}::${row.departmentName}`}>
                    <tr>
                      <td rowSpan={2}>{row.departmentName}</td>
                      <td rowSpan={2}>{row.ventureName}</td>
                      <td>Objectives</td>
                      <td>{row.objectiveSummary.objectiveCount}</td>
                      {tableStatusColumns.map((statusOption) => (
                        <td key={statusOption}>{row.objectiveSummary.statusCounts[statusOption] ?? 0}</td>
                      ))}
                      <td>{formatProgressPercent(row.objectiveSummary.avgProgress)}</td>
                    </tr>
                    <tr>
                      <td>Key Results</td>
                      <td>{row.krSummary.keyResultCount}</td>
                      {tableStatusColumns.map((statusOption) => (
                        <td key={statusOption}>{row.krSummary.statusCounts[statusOption] ?? 0}</td>
                      ))}
                      <td>{formatProgressPercent(row.krSummary.avgProgress)}</td>
                    </tr>
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
