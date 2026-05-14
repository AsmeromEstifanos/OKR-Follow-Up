"use client";

import AssignedToMeToggle from "@/app/assigned-to-me-toggle";
import DashboardObjectiveControls from "@/app/dashboard-objective-controls";
import DashboardObjectiveRowEditor from "@/app/dashboard-objective-row-editor";
import DashboardPositionRowControls from "@/app/dashboard-position-row-controls";
import DashboardVentureTabs from "@/app/dashboard-venture-tabs";
import { resolveOwnerEmail } from "@/lib/owner";
import type {
  CheckInFrequency,
  KeyResult,
  KrStatus,
  MetricType,
  Milestone,
  Objective,
  ObjectiveStatus,
  ObjectiveType,
  OkrCycle,
  Venture
} from "@/lib/types";
import { Fragment, useMemo, useState, type CSSProperties } from "react";
import useCurrentUserEmail from "./use-current-user-email";

type KeyResultRowData = {
  keyResult: KeyResult;
  latestUpdateNotes?: string;
  latestUpdatedAt?: string | null;
  milestones: Milestone[];
};

type ObjectiveRowData = {
  objective: Objective;
  keyResults: KeyResultRowData[];
};

type OwnerSection = {
  positionName: string;
  positionKey?: string;
  positionOwner?: string;
  positionOwnerEmail?: string;
  objectives: ObjectiveRowData[];
};

type Props = {
  ventures: Venture[];
  selectedVentureKey?: string;
  selectedVentureName: string;
  ownerSections: OwnerSection[];
  adminEmails: string[];
  positionControls: React.ReactNode;
  defaultPeriodKey?: string;
  defaultStartDate?: string;
  defaultEndDate?: string;
  defaultCycle: string;
  objectiveTypeOptions: ObjectiveType[];
  objectiveStatusOptions: ObjectiveStatus[];
  objectiveCycleOptions: OkrCycle[];
  metricTypeOptions: MetricType[];
  keyResultStatusOptions: KrStatus[];
  checkInFrequencyOptions: CheckInFrequency[];
  groupColors: string[];
};

function normalizeEmail(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isAssignedObjective(row: ObjectiveRowData, currentUserEmail: string): boolean {
  if (!currentUserEmail) {
    return true;
  }

  if (normalizeEmail(resolveOwnerEmail(row.objective.owner, row.objective.ownerEmail)) === currentUserEmail) {
    return true;
  }

  return row.keyResults.some((entry) => {
    return normalizeEmail(resolveOwnerEmail(entry.keyResult.owner, entry.keyResult.ownerEmail)) === currentUserEmail;
  });
}

function rowMatchesSearch(row: ObjectiveRowData, query: string): boolean {
  if (!query) {
    return true;
  }

  const obj = row.objective;
  const objHaystacks = [obj.title, obj.objectiveCode ?? "", obj.description ?? ""];
  if (objHaystacks.some((value) => value.toLowerCase().includes(query))) {
    return true;
  }

  return row.keyResults.some((entry) => {
    const kr = entry.keyResult;
    const krHaystacks = [kr.title, kr.krCode ?? "", kr.measurementRule ?? ""];
    return krHaystacks.some((value) => value.toLowerCase().includes(query));
  });
}

function CollapseIcon({ expanded }: { expanded: boolean }): JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function SearchIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" strokeLinecap="round" />
    </svg>
  );
}

export default function OkrBoard({
  ventures,
  selectedVentureKey,
  selectedVentureName,
  ownerSections,
  adminEmails,
  positionControls,
  defaultPeriodKey,
  defaultStartDate,
  defaultEndDate,
  defaultCycle,
  objectiveTypeOptions,
  objectiveStatusOptions,
  objectiveCycleOptions,
  metricTypeOptions,
  keyResultStatusOptions,
  checkInFrequencyOptions,
  groupColors
}: Props): JSX.Element {
  const currentUserEmail = normalizeEmail(useCurrentUserEmail());
  const [assignedOnly, setAssignedOnly] = useState<boolean>(false);
  const [forcedOpen, setForcedOpen] = useState<boolean | null>(null);
  const [forceToken, setForceToken] = useState<number>(0);
  const [allExpanded, setAllExpanded] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const trimmedQuery = searchQuery.trim().toLowerCase();

  const visibleSections = useMemo(() => {
    return ownerSections
      .map<OwnerSection>((section) => {
        let objectives = section.objectives;

        if (assignedOnly) {
          objectives = objectives.filter((row) => isAssignedObjective(row, currentUserEmail));
        }

        if (trimmedQuery) {
          objectives = objectives.filter((row) => rowMatchesSearch(row, trimmedQuery));
        }

        return { ...section, objectives };
      })
      .filter((section) => {
        if (assignedOnly || trimmedQuery) {
          return section.objectives.length > 0;
        }
        return true;
      });
  }, [assignedOnly, currentUserEmail, ownerSections, trimmedQuery]);

  const setAllExpandedState = (nextOpen: boolean): void => {
    setForcedOpen(nextOpen);
    setForceToken((value) => value + 1);
    setAllExpanded(nextOpen);
  };

  const boardToolbar = (
    <>
      <div className="board-search">
        <span className="board-search-icon" aria-hidden="true">
          <SearchIcon />
        </span>
        <input
          type="search"
          className="board-search-input"
          placeholder="Search objectives & key results"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          aria-label="Search objectives and key results"
        />
      </div>
      <button
        type="button"
        className="board-collapse-btn"
        onClick={() => setAllExpandedState(!allExpanded)}
        aria-label={allExpanded ? "Collapse all" : "Expand all"}
        title={allExpanded ? "Collapse all" : "Expand all"}
      >
        <CollapseIcon expanded={allExpanded} />
      </button>
      <AssignedToMeToggle checked={assignedOnly} onChange={setAssignedOnly} />
    </>
  );

  return (
    <>
      <DashboardVentureTabs
        ventures={ventures}
        selectedVentureKey={selectedVentureKey}
        adminEmails={adminEmails}
        toolbar={boardToolbar}
      />

      <section className="section">
        <div className="section-header">
          <div className="section-header-left">
            <h2>OKR Board View</h2>
            {positionControls}
          </div>
        </div>

        {visibleSections.length === 0 ? (
          <p className="meta">
            {trimmedQuery
              ? "No objectives or key results match your search."
              : assignedOnly
              ? "No assigned objectives available."
              : "No objectives available."}
          </p>
        ) : (
          <div className="board-groups">
            {visibleSections.map((section, sectionIndex) => {
              const sectionStyle = {
                "--group-color": groupColors[sectionIndex % groupColors.length]
              } as CSSProperties;
              const positionScopeKey = [selectedVentureKey ?? "default", section.positionKey ?? section.positionName].join("::");

              return (
                <section className="board-group" key={positionScopeKey} style={sectionStyle}>
                  <DashboardPositionRowControls
                    selectedVentureKey={selectedVentureKey}
                    departmentKey={section.positionKey}
                    positionName={section.positionName}
                    positionOwner={section.positionOwner}
                    positionOwnerEmail={section.positionOwnerEmail}
                    objectiveCount={section.objectives.length}
                    adminEmails={adminEmails}
                    forcedOpen={forcedOpen}
                    forceToken={forceToken}
                  >
                    <div className="board-group-title-wrap">
                      <div className="board-group-title-row">
                        <DashboardObjectiveControls
                          key={`${positionScopeKey}::objectives`}
                          positionName={section.positionName}
                          strategicTheme={selectedVentureName}
                          defaultPeriodKey={defaultPeriodKey}
                          defaultStartDate={defaultStartDate}
                          defaultEndDate={defaultEndDate}
                          defaultCycle={defaultCycle}
                          defaultOwner={section.positionOwner ?? ""}
                          defaultOwnerEmail={section.positionOwnerEmail ?? ""}
                          positionOwnerEmail={section.positionOwnerEmail}
                          adminEmails={adminEmails}
                          objectiveTypeOptions={objectiveTypeOptions}
                          objectiveStatusOptions={objectiveStatusOptions}
                          objectiveCycleOptions={objectiveCycleOptions}
                        />
                      </div>
                    </div>
                    <div className="table-wrap">
                      <table className="board-table">
                        <thead>
                          <tr>
                            <th>Objective</th>
                            <th>Objective Intent</th>
                            <th className="chat-col-header">Chat</th>
                            <th>Due Date</th>
                            <th>Constraint / Guardrails</th>
                            <th>Objective Progress %</th>
                            <th>Objective Status (RAG)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.objectives.length === 0 ? (
                            <tr className="board-empty-row">
                              <td colSpan={7}>No objectives yet for this position.</td>
                            </tr>
                          ) : (
                            section.objectives.map((row) => (
                              <Fragment key={row.objective.objectiveKey}>
                                <DashboardObjectiveRowEditor
                                  objective={row.objective}
                                  keyResults={row.keyResults}
                                  positionOwnerEmail={section.positionOwnerEmail}
                                  adminEmails={adminEmails}
                                  forcedExpanded={forcedOpen}
                                  forceToken={forceToken}
                                  highlightQuery={trimmedQuery}
                                  objectiveTypeOptions={objectiveTypeOptions}
                                  objectiveStatusOptions={objectiveStatusOptions}
                                  objectiveCycleOptions={objectiveCycleOptions}
                                  metricTypeOptions={metricTypeOptions}
                                  keyResultStatusOptions={keyResultStatusOptions}
                                  checkInFrequencyOptions={checkInFrequencyOptions}
                                />
                              </Fragment>
                            ))
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
    </>
  );
}
