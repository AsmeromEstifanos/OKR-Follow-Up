"use client";

import AssignedToMeToggle from "@/app/assigned-to-me-toggle";
import DashboardObjectiveControls from "@/app/dashboard-objective-controls";
import DashboardObjectiveRowEditor from "@/app/dashboard-objective-row-editor";
import DashboardPositionRowControls from "@/app/dashboard-position-row-controls";
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
  OkrCycle
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

export default function OkrBoard({
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

  const visibleSections = useMemo(() => {
    return ownerSections
      .map<OwnerSection>((section) => {
        if (!assignedOnly) {
          return section;
        }

        return {
          ...section,
          objectives: section.objectives.filter((row) => isAssignedObjective(row, currentUserEmail))
        };
      })
      .filter((section) => !assignedOnly || section.objectives.length > 0);
  }, [assignedOnly, currentUserEmail, ownerSections]);

  const setAllExpandedState = (nextOpen: boolean): void => {
    setForcedOpen(nextOpen);
    setForceToken((value) => value + 1);
    setAllExpanded(nextOpen);
  };

  return (
    <>
      <div className="section-header">
        <div className="section-header-left">
          <h2>OKR Board View</h2>
          {positionControls}
        </div>
        <div className="board-toolbar-actions">
          <button className="tab-btn" type="button" onClick={() => setAllExpandedState(!allExpanded)}>
            {allExpanded ? "Collapse All" : "Expand All"}
          </button>
          <AssignedToMeToggle checked={assignedOnly} onChange={setAssignedOnly} />
        </div>
      </div>

      {visibleSections.length === 0 ? (
        <p className="meta">{assignedOnly ? "No assigned objectives available." : "No objectives available."}</p>
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
                        defaultOwner=""
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
                          <th>Owner</th>
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
    </>
  );
}
