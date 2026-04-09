import { getConfig, getObjectiveWithContext, listObjectives, listPeriods } from "@/lib/store";
import Link from "next/link";
import { notFound } from "next/navigation";
import KeyResultEditControls from "./key-result-edit-controls";
import ObjectiveEditControls from "./objective-edit-controls";

export const dynamic = "force-dynamic";

type Props = {
  params: {
    objectiveKey: string;
  };
};

function formatDate(value: string | null): string {
  if (!value) {
    return "Never";
  }

  return new Date(value).toLocaleDateString();
}

function getMostRecentTimestamp(primary: string | null | undefined, fallback: string | null | undefined): string | null {
  const candidates = [primary, fallback]
    .map((value) => (typeof value === "string" ? value : ""))
    .filter((value) => Boolean(value))
    .sort((left, right) => left.localeCompare(right));

  return candidates.at(-1) ?? null;
}

function pillClass(rag: string): string {
  if (rag === "Green") {
    return "pill pill-green";
  }

  if (rag === "Amber") {
    return "pill pill-amber";
  }

  return "pill pill-red";
}

export default async function ObjectiveDetailPage({ params }: Props): Promise<JSX.Element> {
  const data = await getObjectiveWithContext(params.objectiveKey);

  if (!data) {
    notFound();
  }

  const config = await getConfig();
  const periodOptions = (await listPeriods()).map((period) => period.periodKey);
  const departmentOptions = config.ventures.flatMap((venture) => venture.departments.map((department) => department.name));
  const objectiveOptions = (await listObjectives()).map((item) => ({
    objectiveKey: item.objectiveKey,
    objectiveCode: item.objectiveCode ?? item.objectiveKey,
    title: item.title
  }));

  const { objective, keyResults, latestCheckIns } = data;

  return (
    <div>
      <h1 className="page-title">{objective.title}</h1>
      <p className="subtitle">{objective.description}</p>

      <section className="section">
        <div className="section-header">
          <h2>Objective Details</h2>
        </div>
        <p className="meta">Objective code: {objective.objectiveCode ?? objective.objectiveKey}</p>
        <ObjectiveEditControls
          objective={objective}
          periodOptions={periodOptions}
          departmentOptions={departmentOptions}
          objectiveTypeOptions={config.fieldOptions.objectiveTypes}
          objectiveStatusOptions={config.fieldOptions.objectiveStatuses}
          objectiveCycleOptions={config.fieldOptions.objectiveCycles}
        />
      </section>

      <section className="card-grid">
        <article className="stat-card">
          <h3>Progress</h3>
          <div className="stat-number">{objective.progressPct}%</div>
        </article>
        <article className="stat-card">
          <h3>Status</h3>
          <div className="stat-number">{objective.status}</div>
        </article>
        <article className="stat-card">
          <h3>Confidence</h3>
          <div className="stat-number">{objective.confidence}</div>
        </article>
        <article className="stat-card">
          <h3>RAG</h3>
          <div className="row-between">
            <span className={pillClass(objective.rag)}>{objective.rag}</span>
          </div>
        </article>
      </section>

      <section className="section">
        <div className="section-header">
          <h2>Key Results</h2>
          <Link href="/" className="btn-link">
            Back to dashboard
          </Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>KR</th>
                <th>Owner</th>
                <th>Progress</th>
                <th>Last update</th>
                <th>Latest Notes</th>
                <th>Blockers</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {keyResults.length === 0 ? (
                <tr>
                  <td colSpan={7}>No key results for this objective.</td>
                </tr>
              ) : (
                keyResults.map((kr) => {
                  const latest = latestCheckIns[kr.krKey];
                  return (
                    <tr key={kr.krKey}>
                      <td>
                        {kr.title}
                        <div className="meta">{kr.krCode ?? kr.krKey}</div>
                      </td>
                      <td>{kr.owner || "-"}</td>
                      <td>
                        {kr.progressPct}% ({kr.currentValue}/{kr.targetValue})
                      </td>
                      <td>{formatDate(getMostRecentTimestamp(latest?.checkInAt, kr.lastCheckinAt))}</td>
                      <td>{latest?.updateNotes || "-"}</td>
                      <td>{latest?.blockers || kr.blockers || "-"}</td>
                      <td>
                        <Link className="btn-link" href={`/krs/${kr.krKey}/checkin`}>
                          Update KR
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {keyResults.length > 0 ? (
          <div className="kr-edit-grid">
            {keyResults.map((kr) => (
              <KeyResultEditControls
                key={kr.krKey}
                keyResult={kr}
                periodOptions={periodOptions}
                objectiveOptions={objectiveOptions}
                metricTypeOptions={config.fieldOptions.keyResultMetricTypes}
                keyResultStatusOptions={config.fieldOptions.keyResultStatuses}
                checkInFrequencyOptions={config.fieldOptions.checkInFrequencies}
              />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
