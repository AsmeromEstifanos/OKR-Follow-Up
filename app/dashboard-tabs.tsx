"use client";

import { resolveOwnerEmail } from "@/lib/owner";
import type { Objective } from "@/lib/types";
import { useMemo, useState } from "react";

type DashboardView = "overview" | "department" | "objective";
type HealthBucket = "Green" | "Amber" | "Red";
type HealthCounts = Record<HealthBucket, number>;

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

type Props = {
  initialView: DashboardView;
  scopeLabel: string;
  objectiveGroups: DepartmentObjectiveGroup[];
};

function normalizeEmail(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function emptyCounts(): HealthCounts {
  return { Green: 0, Amber: 0, Red: 0 };
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

function countObjectiveHealth(objectives: Objective[]): HealthCounts {
  return objectives.reduce<HealthCounts>((counts, objective) => {
    const bucket = objective.rag as HealthBucket;
    counts[bucket] += 1;
    return counts;
  }, emptyCounts());
}

function getPercent(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return (value / total) * 100;
}

function bucketValue(counts: HealthCounts, bucket: HealthBucket): number {
  return counts[bucket];
}

function bucketPercent(counts: HealthCounts, bucket: HealthBucket): number {
  const total = counts.Green + counts.Amber + counts.Red;
  return getPercent(bucketValue(counts, bucket), total);
}

function bucketClass(bucket: HealthBucket): string {
  if (bucket === "Green") {
    return "analytics-bar-fill-green";
  }

  if (bucket === "Amber") {
    return "analytics-bar-fill-amber";
  }

  return "analytics-bar-fill-red";
}

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString();
}

function renderHealthBars(counts: HealthCounts): JSX.Element {
  return (
    <div className="analytics-bar-chart analytics-bar-chart-compact">
      {(["Green", "Amber", "Red"] as HealthBucket[]).map((bucket) => (
        <div key={bucket} className="analytics-bar-row">
          <div className="analytics-bar-track">
            <span
              className={`analytics-bar-fill ${bucketClass(bucket)}`}
              style={{ width: `${bucketPercent(counts, bucket)}%` }}
            />
          </div>
          <div className="analytics-bar-value">{bucketValue(counts, bucket)}</div>
        </div>
      ))}
    </div>
  );
}

export default function DashboardTabs({
  initialView,
  scopeLabel,
  objectiveGroups
}: Props): JSX.Element {
  const [selectedView, setSelectedView] = useState<DashboardView>(initialView);
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(objectiveGroups.map((group) => `${group.ventureName}::${group.departmentName}`))
  );

  const visibleGroups = useMemo(() => {
    return objectiveGroups.filter((group) => group.objectives.length > 0);
  }, [objectiveGroups]);

  const flatObjectives = useMemo(() => {
    return visibleGroups.flatMap((group) => group.objectives.map((row) => ({ ...row, ventureName: group.ventureName, departmentName: group.departmentName })));
  }, [visibleGroups]);

  const overallCounts = useMemo(() => countObjectiveHealth(flatObjectives.map((row) => row.objective)), [flatObjectives]);
  const overallTotal = flatObjectives.length;
  const avgObjectiveProgress = useMemo(() => {
    if (flatObjectives.length === 0) {
      return 0;
    }

    return flatObjectives.reduce((sum, row) => sum + row.objective.progressPct, 0) / flatObjectives.length;
  }, [flatObjectives]);

  const ventureAverageRows = useMemo(() => {
    const byVenture = new Map<string, { total: number; progressSum: number }>();

    flatObjectives.forEach((row) => {
      const current = byVenture.get(row.ventureName) ?? { total: 0, progressSum: 0 };
      current.total += 1;
      current.progressSum += row.objective.progressPct;
      byVenture.set(row.ventureName, current);
    });

    return Array.from(byVenture.entries())
      .map(([ventureName, value]) => ({
        ventureName,
        total: value.total,
        averageProgress: value.total > 0 ? value.progressSum / value.total : 0
      }))
      .sort((left, right) => left.ventureName.localeCompare(right.ventureName));
  }, [flatObjectives]);

  const departmentHealthRows = useMemo(() => {
    const byDepartment = new Map<string, { ventureName: string; departmentName: string; objectives: Objective[] }>();

    flatObjectives.forEach((row) => {
      const key = `${row.ventureName}::${row.departmentName}`;
      const current = byDepartment.get(key) ?? {
        ventureName: row.ventureName,
        departmentName: row.departmentName,
        objectives: []
      };
      current.objectives.push(row.objective);
      byDepartment.set(key, current);
    });

    return Array.from(byDepartment.values()).map((row) => ({
      ventureName: row.ventureName,
      departmentName: row.departmentName,
      total: row.objectives.length,
      counts: countObjectiveHealth(row.objectives)
    }));
  }, [flatObjectives]);

  const visibleGroupKeys = useMemo(() => {
    return visibleGroups.map((group) => `${group.ventureName}::${group.departmentName}`);
  }, [visibleGroups]);
  const areAllObjectiveGroupsOpen = visibleGroupKeys.length > 0 && visibleGroupKeys.every((key) => openGroups.has(key));

  const setAllObjectiveGroups = (isOpen: boolean): void => {
    setOpenGroups(isOpen ? new Set(visibleGroupKeys) : new Set());
  };

  const toggleObjectiveGroup = (groupKey: string): void => {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }

      return next;
    });
  };

  return (
    <>
      <div className="analytics-tab-toolbar">
        <div className="analytics-tab-row">
          <button className={`tab-btn ${selectedView === "overview" ? "tab-btn-active" : ""}`} type="button" onClick={() => setSelectedView("overview")}>
            OKR Dashboard
          </button>
          <button className={`tab-btn ${selectedView === "department" ? "tab-btn-active" : ""}`} type="button" onClick={() => setSelectedView("department")}>
            OKR Health by Department
          </button>
          <button className={`tab-btn ${selectedView === "objective" ? "tab-btn-active" : ""}`} type="button" onClick={() => setSelectedView("objective")}>
            Objective View per Department
          </button>
        </div>
        <div className="analytics-tab-actions">
          {selectedView === "objective" ? (
            <button className="tab-btn" type="button" onClick={() => setAllObjectiveGroups(!areAllObjectiveGroupsOpen)}>
              {areAllObjectiveGroupsOpen ? "Collapse All" : "Expand All"}
            </button>
          ) : null}
          <span className="meta">Scope: {scopeLabel}</span>
        </div>
      </div>

      {selectedView === "overview" ? (
        <div className="analytics-health-layout">
          <article className="analytics-summary-card analytics-health-card">
            <h3>Overall OKR Health</h3>
            <div className="analytics-health-copy">
              <div className="analytics-summary-value">{overallTotal}</div>
              <p className="meta analytics-summary-meta">Objective(s) included</p>
            </div>
            {renderHealthBars(overallCounts)}
            <div className="analytics-health-legend">
              <span className="analytics-legend-item analytics-legend-green">Green {overallCounts.Green}</span>
              <span className="analytics-legend-item analytics-legend-amber">Amber {overallCounts.Amber}</span>
              <span className="analytics-legend-item analytics-legend-red">Red {overallCounts.Red}</span>
            </div>
          </article>

          <article className="analytics-summary-card analytics-summary-progress analytics-venture-averages-card">
            <div className="analytics-department-head">
              <div>
                <h3>Venture Averages</h3>
                <p className="meta">Overall average: {formatProgressPercent(avgObjectiveProgress)}</p>
              </div>
            </div>
            <div className="analytics-venture-average-list">
              {ventureAverageRows.length === 0 ? (
                <p className="meta">No venture averages for the current filter.</p>
              ) : (
                ventureAverageRows.map((row) => (
                  <div key={row.ventureName} className="analytics-venture-average-row">
                    <div className="analytics-progress-row">
                      <span>{row.ventureName}</span>
                      <span>
                        {formatProgressPercent(row.averageProgress)} · {row.total}
                      </span>
                    </div>
                    <div className="analytics-progress-track">
                      <span style={{ width: `${Math.max(0, Math.min(100, row.averageProgress))}%` }} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>
        </div>
      ) : null}

      {selectedView === "department" ? (
        <div className="analytics-department-list">
          {departmentHealthRows.length === 0 ? (
            <p className="meta">No department health data for the current filter.</p>
          ) : (
            departmentHealthRows.map((row) => (
              <article key={`${row.ventureName}::${row.departmentName}`} className="analytics-department-card">
                <div className="analytics-department-head">
                  <div>
                    <h3>{row.departmentName}</h3>
                    <p className="meta">{row.ventureName}</p>
                  </div>
                  <span className="meta">{row.total} objective(s)</span>
                </div>
                {renderHealthBars(row.counts)}
                <div className="analytics-health-legend">
                  <span className="analytics-legend-item analytics-legend-green">Green {row.counts.Green}</span>
                  <span className="analytics-legend-item analytics-legend-amber">Amber {row.counts.Amber}</span>
                  <span className="analytics-legend-item analytics-legend-red">Red {row.counts.Red}</span>
                </div>
              </article>
            ))
          )}
        </div>
      ) : null}

      {selectedView === "objective" ? (
        visibleGroups.length === 0 ? (
          <p className="meta">No objective detail available for the current filter.</p>
        ) : (
          <div className="analytics-department-groups">
            {visibleGroups.map((group) => {
              const groupKey = `${group.ventureName}::${group.departmentName}`;
              const isOpen = openGroups.has(groupKey);

              return (
                <div key={groupKey} className="analytics-department-group">
                  <button
                    type="button"
                    className="analytics-department-group-toggle"
                    aria-expanded={isOpen}
                    onClick={() => toggleObjectiveGroup(groupKey)}
                  >
                    <span className="analytics-department-group-toggle-main">
                      <span className="analytics-department-group-toggle-text">
                        <h3>{group.departmentName}</h3>
                        <span className="meta">{group.ventureName}</span>
                      </span>
                      <span className="meta">{group.objectives.length} objective(s)</span>
                    </span>
                  </button>

                  {isOpen ? (
                    <div className="analytics-objective-list">
                      {group.objectives.map((row) => (
                        <article key={row.objective.objectiveKey} className="analytics-objective-card">
                          <div className="analytics-objective-head">
                            <div>
                              <h3>{row.objective.title}</h3>
                              <p className="meta">{row.objective.objectiveCode ?? row.objective.objectiveKey}</p>
                            </div>
                            <span className="meta">{row.objective.rag}</span>
                          </div>

                          <p className="analytics-objective-submeta">
                            Owner: {row.objective.owner || "-"} | Due: {formatDate(row.objective.endDate)} | KRs: {row.keyResultCount} | Milestones: {row.milestoneCount}
                          </p>

                          {renderHealthBars(countObjectiveHealth([row.objective]))}

                          <div className="analytics-health-legend">
                            <span className="analytics-legend-item analytics-legend-green">Green {row.objective.rag === "Green" ? 1 : 0}</span>
                            <span className="analytics-legend-item analytics-legend-amber">Amber {row.objective.rag === "Amber" ? 1 : 0}</span>
                            <span className="analytics-legend-item analytics-legend-red">Red {row.objective.rag === "Red" ? 1 : 0}</span>
                          </div>

                          <div className="analytics-progress-row">
                            <span>Objective Progress</span>
                            <span>{formatProgressPercent(row.objective.progressPct)}</span>
                          </div>
                          <div className="analytics-progress-track">
                            <span style={{ width: `${Math.max(0, Math.min(100, row.objective.progressPct))}%` }} />
                          </div>

                          <div className="analytics-blockers">
                            <strong>Blockers</strong>
                            <p>{row.blockers.length > 0 ? row.blockers.join(" | ") : "-"}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )
      ) : null}
    </>
  );
}
