import DashboardFilters from "@/app/dashboard-filters";
import { getConfig, listKeyResults, listObjectives } from "@/lib/store";
import type { Objective, ObjectiveStatus, Venture } from "@/lib/types";
import Link from "next/link";

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
  onTrackCount: number;
  atRiskCount: number;
  offTrackCount: number;
  avgProgress: number;
};

type VentureRow = Summary & {
  ventureKey: string;
  ventureName: string;
};

type DepartmentRow = Summary & {
  ventureName: string;
  departmentName: string;
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

function objectiveBelongsToVenture(objective: Objective, venture: Venture): boolean {
  return venture.departments.some((department) => department.name.toLowerCase() === objective.department.toLowerCase());
}

function computeSummary(objectives: Objective[], keyResultCountByObjective: Map<string, number>): Summary {
  const objectiveCount = objectives.length;
  const keyResultCount = objectives.reduce((total, objective) => {
    return total + (keyResultCountByObjective.get(objective.objectiveKey.toLowerCase()) ?? 0);
  }, 0);
  const onTrackCount = objectives.filter((objective) => objective.status === "OnTrack" || objective.status === "Done").length;
  const atRiskCount = objectives.filter((objective) => objective.status === "AtRisk").length;
  const offTrackCount = objectives.filter((objective) => objective.status === "OffTrack").length;
  const avgProgress =
    objectiveCount > 0
      ? objectives.reduce((sum, objective) => sum + (Number.isFinite(objective.progressPct) ? objective.progressPct : 0), 0) / objectiveCount
      : 0;

  return {
    objectiveCount,
    keyResultCount,
    onTrackCount,
    atRiskCount,
    offTrackCount,
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

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
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

  const ventureRowsAll = ventures.map<VentureRow>((venture) => {
    const scopedObjectives = filteredObjectives.filter((objective) => objectiveBelongsToVenture(objective, venture));
    return {
      ventureKey: venture.ventureKey,
      ventureName: venture.name,
      ...computeSummary(scopedObjectives, keyResultCountByObjective)
    };
  });
  const ventureRows = selectedVenture
    ? ventureRowsAll.filter((row) => row.ventureKey.toLowerCase() === selectedVenture.ventureKey.toLowerCase())
    : ventureRowsAll.filter((row) => row.objectiveCount > 0);

  const departmentRowsAll = ventures.flatMap<DepartmentRow>((venture) =>
    venture.departments.map((department) => {
      const scopedObjectives = filteredObjectives.filter((objective) => {
        return (
          objective.department.toLowerCase() === department.name.toLowerCase() && objectiveBelongsToVenture(objective, venture)
        );
      });

      return {
        ventureName: venture.name,
        departmentName: department.name,
        ...computeSummary(scopedObjectives, keyResultCountByObjective)
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

    return row.objectiveCount > 0;
  });

  const statusPriority: Record<ObjectiveStatus, number> = {
    OffTrack: 0,
    AtRisk: 1,
    NotStarted: 2,
    OnTrack: 3,
    Done: 4
  };
  const objectiveCards = [...filteredObjectives].sort((left, right) => {
    const statusDelta = statusPriority[left.status] - statusPriority[right.status];
    if (statusDelta !== 0) {
      return statusDelta;
    }

    const progressDelta = right.progressPct - left.progressPct;
    if (progressDelta !== 0) {
      return progressDelta;
    }

    return left.title.localeCompare(right.title);
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
      <section className="section analytics-overview">
        <div className="section-header">
          <h2>OKR Dashboard</h2>
          <span className="meta">Scope: {scopeLabel}</span>
        </div>

        <div className="analytics-summary-grid">
          <article className="analytics-summary-card analytics-summary-ontrack">
            <h3>On Track</h3>
            <div className="analytics-summary-value">{summary.onTrackCount}</div>
          </article>
          <article className="analytics-summary-card analytics-summary-atrisk">
            <h3>At Risk</h3>
            <div className="analytics-summary-value">{summary.atRiskCount}</div>
          </article>
          <article className="analytics-summary-card analytics-summary-offtrack">
            <h3>Off Track</h3>
            <div className="analytics-summary-value">{summary.offTrackCount}</div>
          </article>
          <article className="analytics-summary-card analytics-summary-progress">
            <h3>Avg Progress</h3>
            <div className="analytics-summary-value">{Math.round(summary.avgProgress)}%</div>
          </article>
        </div>

        <p className="meta analytics-summary-meta">
          {summary.objectiveCount} objective(s) and {summary.keyResultCount} key result(s)
        </p>
      </section>

      <DashboardFilters ventures={ventures} selectedVentureKey={selectedVenture?.ventureKey} selectedDepartment={selectedDepartment} />

      <section className="section">
        <div className="section-header">
          <h2>Venture Performance</h2>
        </div>
        <div className="table-wrap">
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Venture</th>
                <th>Objectives</th>
                <th>Key Results</th>
                <th>On Track</th>
                <th>At Risk</th>
                <th>Off Track</th>
                <th>Avg Progress</th>
              </tr>
            </thead>
            <tbody>
              {ventureRows.length === 0 ? (
                <tr>
                  <td colSpan={7}>No venture data for the current filter.</td>
                </tr>
              ) : (
                ventureRows.map((row) => (
                  <tr key={row.ventureKey}>
                    <td>{row.ventureName}</td>
                    <td>{row.objectiveCount}</td>
                    <td>{row.keyResultCount}</td>
                    <td>{row.onTrackCount}</td>
                    <td>{row.atRiskCount}</td>
                    <td>{row.offTrackCount}</td>
                    <td>{Math.round(row.avgProgress)}%</td>
                  </tr>
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
                <th>Objectives</th>
                <th>Key Results</th>
                <th>On Track</th>
                <th>At Risk</th>
                <th>Off Track</th>
                <th>Avg Progress</th>
              </tr>
            </thead>
            <tbody>
              {departmentRows.length === 0 ? (
                <tr>
                  <td colSpan={8}>No department data for the current filter.</td>
                </tr>
              ) : (
                departmentRows.map((row) => (
                  <tr key={`${row.ventureName}::${row.departmentName}`}>
                    <td>{row.departmentName}</td>
                    <td>{row.ventureName}</td>
                    <td>{row.objectiveCount}</td>
                    <td>{row.keyResultCount}</td>
                    <td>{row.onTrackCount}</td>
                    <td>{row.atRiskCount}</td>
                    <td>{row.offTrackCount}</td>
                    <td>{Math.round(row.avgProgress)}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <h2>Objective Snapshot</h2>
          <span className="meta">{objectiveCards.length} objective(s)</span>
        </div>

        {objectiveCards.length === 0 ? (
          <p className="meta">No objectives match the current filter.</p>
        ) : (
          <div className="analytics-objective-list">
            {objectiveCards.map((objective) => {
              const progress = clampPercent(objective.progressPct);
              const keyResultsCount = keyResultCountByObjective.get(objective.objectiveKey.toLowerCase()) ?? 0;
              return (
                <article key={objective.objectiveKey} className="analytics-objective-card">
                  <div className="analytics-objective-head">
                    <div>
                      <h3>{objective.title}</h3>
                      <p className="meta">
                        {objective.objectiveCode ?? objective.objectiveKey} - {objective.department} -{" "}
                        {objective.ventureName || objective.strategicTheme}
                      </p>
                    </div>
                    <span className={`analytics-status-pill ${toStatusClass(objective.status)}`}>{formatStatus(objective.status)}</span>
                  </div>

                  <p className="analytics-objective-submeta">
                    Owner: {objective.owner || "-"} - KRs: {keyResultsCount} - Cycle: {objective.okrCycle}
                  </p>

                  <div className="analytics-progress-row">
                    <span>Progress</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <div className="analytics-progress-track" aria-hidden="true">
                    <span style={{ width: `${progress}%` }} />
                  </div>

                  <div className="analytics-objective-footer">
                    <span className="meta">RAG: {objective.rag}</span>
                    <Link className="btn-link" href={`/objectives/${objective.objectiveKey}`}>
                      Open
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

