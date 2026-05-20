"use client";

import useCurrentUserEmail from "@/app/use-current-user-email";
import { apiPath } from "@/lib/base-path";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ActivityEntry = {
  activityLogKey: string;
  userEmail: string;
  activityName: string;
  httpMethod: string;
  routePath: string;
  occurredAt: string;
  entityType?: string;
  entityKey?: string;
  entityLabel?: string;
  detailsJson?: string;
};

type ActivityPage = {
  entries: ActivityEntry[];
  nextCursor: string | null;
};

type FieldChange = {
  field: string;
  from: unknown;
  to: unknown;
};

type Period = "today" | "week" | "month" | "quarter" | "year" | "custom";

const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  week: "Last 7 days",
  month: "Last 30 days",
  quarter: "Last 90 days",
  year: "Last year",
  custom: "Custom range"
};

// Human-readable field name mapping
const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  description: "Description",
  status: "Status",
  progressPct: "Progress",
  currentValue: "Current value",
  targetValue: "Target value",
  baselineValue: "Baseline value",
  confidence: "Confidence",
  owner: "Owner",
  ownerEmail: "Owner email",
  department: "Department",
  strategicTheme: "Strategic theme",
  objectiveType: "Objective type",
  okrCycle: "OKR cycle",
  periodKey: "Period",
  startDate: "Start date",
  endDate: "End date",
  dueDate: "Due date",
  blockers: "Blockers",
  notes: "Notes",
  keyRisksDependency: "Key risks & dependencies",
  constraintGuardrails: "Constraints & guardrails",
  supportNeeded: "Support needed",
  metricType: "Metric type",
  measurementRule: "Measurement rule",
  checkInFrequency: "Check-in frequency",
  krCode: "KR code",
  objectiveCode: "Objective code",
  objectiveKey: "Objective",
  rag: "RAG status"
};

// Fields to skip in the diff display (internal/noisy)
const SKIP_FIELDS = new Set([
  "updatedAt", "createdAt", "activityLogKey", "authLogKey",
  "krKey", "objectiveKey_internal", "milestoneKey", "checkInKey"
]);

function parseChanges(detailsJson: string | undefined): FieldChange[] {
  if (!detailsJson) return [];
  try {
    const parsed = JSON.parse(detailsJson) as { changes?: FieldChange[] };
    return (parsed.changes ?? []).filter((c) => !SKIP_FIELDS.has(c.field));
  } catch {
    return [];
  }
}

function friendlyFieldName(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}

const DATE_FIELDS = new Set(["startDate", "endDate", "dueDate", "lastCheckinAt"]);

function formatValue(value: unknown, field?: string): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") {
    if (!value.trim()) return "—";
    if (field === "progressPct") return `${value}%`;
    if (field && DATE_FIELDS.has(field)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        return field === "lastCheckinAt" ? d.toLocaleString() : d.toLocaleDateString();
      }
    }
    return value;
  }
  if (typeof value === "number") {
    if (field === "progressPct") return `${value}%`;
    return String(value);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return JSON.stringify(value);
}

const ENTITY_TYPE_WORDS: Record<string, string> = {
  objectives: "objective",
  krs: "key result",
  milestones: "milestone",
  "check-ins": "check-in",
  periods: "period",
  ventures: "venture",
  position: "position",
  venture: "venture",
  admin: "admin",
  "dropdown-config": "dropdown config",
  "rag-config": "RAG config",
  notification: "notification"
};

// Compose a human-readable sentence from the log entry
function composeActionSentence(entry: ActivityEntry): string {
  const { httpMethod, entityType } = entry;

  const entityWord = entityType
    ? (ENTITY_TYPE_WORDS[entityType] ?? entityType.replace(/-/g, " ").replace(/s$/, ""))
    : "item";

  if (httpMethod === "POST") return `Created ${entityWord}`;
  if (httpMethod === "DELETE") return `Deleted ${entityWord}`;
  if (httpMethod === "PATCH") return `Updated ${entityWord}`;
  return entry.activityName;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function formatDayHeading(iso: string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

function isoDay(iso: string): string {
  return iso.slice(0, 10);
}

function actionClass(method: string): string {
  if (method === "POST") return "act-action act-action-create";
  if (method === "PATCH") return "act-action act-action-update";
  if (method === "DELETE") return "act-action act-action-delete";
  return "act-action";
}

// Aggregate counts per day for the bar chart
function buildDailyBuckets(entries: ActivityEntry[]): { label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const e of entries) {
    const d = isoDay(e.occurredAt);
    map.set(d, (map.get(d) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, count]) => ({ label: day.slice(5), count }));
}

function buildEntityTypeCounts(entries: ActivityEntry[]): { type: string; count: number }[] {
  const map = new Map<string, number>();
  for (const e of entries) {
    const t = e.entityType ?? "other";
    map.set(t, (map.get(t) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}

function buildTopUsers(entries: ActivityEntry[]): { email: string; count: number }[] {
  const map = new Map<string, number>();
  for (const e of entries) {
    map.set(e.userEmail, (map.get(e.userEmail) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([email, count]) => ({ email, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function buildTopEntities(entries: ActivityEntry[]): { label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const e of entries) {
    if (!e.entityLabel && !e.entityKey) continue;
    const label = e.entityLabel ?? e.entityKey ?? "";
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function BarChart({ data }: { data: { label: string; count: number }[] }): JSX.Element {
  const max = Math.max(...data.map((d) => d.count), 1);
  const barWidth = Math.min(40, Math.floor(600 / Math.max(data.length, 1)) - 4);
  const chartWidth = data.length * (barWidth + 4) + 20;

  return (
    <svg
      viewBox={`0 0 ${chartWidth} 100`}
      className="act-bar-chart"
      aria-label="Activity bar chart"
      role="img"
    >
      {data.map((d, i) => {
        const barH = Math.round((d.count / max) * 70);
        const x = 10 + i * (barWidth + 4);
        const y = 80 - barH;
        return (
          <g key={d.label}>
            <rect x={x} y={y} width={barWidth} height={barH} className="act-bar" rx="2" />
            <title>{`${d.label}: ${d.count}`}</title>
            <text x={x + barWidth / 2} y={96} textAnchor="middle" className="act-bar-label" fontSize="5">
              {d.label.length > 6 ? d.label.slice(0, 5) + "…" : d.label}
            </text>
            <text x={x + barWidth / 2} y={y - 2} textAnchor="middle" className="act-bar-value" fontSize="5">
              {d.count}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Order in which fields appear in the detail popup. Anything not listed here
// is appended afterwards in object order. Internal/noisy keys are skipped.
const OBJECTIVE_FIELD_ORDER = [
  "objectiveCode", "title", "description", "status", "rag", "progressPct",
  "owner", "ownerEmail", "department", "ventureName", "strategicTheme",
  "objectiveType", "okrCycle", "confidence", "periodKey", "startDate", "endDate",
  "constraintGuardrails", "keyRisksDependency", "blockers", "notes", "lastCheckinAt"
];

const KR_FIELD_ORDER = [
  "krCode", "title", "status", "progressPct", "metricType", "measurementRule",
  "baselineValue", "targetValue", "currentValue", "owner", "ownerEmail",
  "objectiveKey", "periodKey", "dueDate", "checkInFrequency",
  "blockers", "supportNeeded", "notes", "lastCheckinAt"
];

// Keys never shown in the all-fields view (internal identifiers)
const HIDDEN_DETAIL_FIELDS = new Set(["objectiveKey", "krKey"]);

// Maps the activity entityType slug to the board list endpoint + key field.
const ENTITY_FETCH_CONFIG: Record<string, { path: string; keyField: string; codeField?: string }> = {
  objectives: { path: "/api/objectives", keyField: "objectiveKey", codeField: "objectiveCode" },
  krs: { path: "/api/krs", keyField: "krKey", codeField: "krCode" }
};

function orderedEntries(
  item: Record<string, unknown>,
  order: string[]
): Array<[string, unknown]> {
  const seen = new Set<string>();
  const result: Array<[string, unknown]> = [];
  for (const key of order) {
    if (key in item) {
      result.push([key, item[key]]);
      seen.add(key);
    }
  }
  for (const key of Object.keys(item)) {
    if (seen.has(key) || HIDDEN_DETAIL_FIELDS.has(key) || SKIP_FIELDS.has(key)) continue;
    result.push([key, item[key]]);
  }
  return result.filter(([key]) => !HIDDEN_DETAIL_FIELDS.has(key));
}

// Parse the code (e.g. "KR-004") from an entity label like "KR-004 Some title".
function codeFromLabel(label: string | undefined): string | null {
  if (!label) return null;
  const match = label.trim().match(/^([A-Za-z]+-\d+)/);
  return match ? match[1] : null;
}

function DetailPopup({
  entry,
  userEmail,
  onClose
}: {
  entry: ActivityEntry;
  userEmail: string;
  onClose: () => void;
}): JSX.Element {
  const changes = parseChanges(entry.detailsJson);
  const config = entry.entityType ? ENTITY_FETCH_CONFIG[entry.entityType] : undefined;

  const [item, setItem] = useState<Record<string, unknown> | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "loaded" | "notfound" | "error">(
    config ? "loading" : "idle"
  );

  useEffect(() => {
    if (!config || !userEmail) return;
    let mounted = true;
    setLoadState("loading");
    fetch(apiPath(config.path), { headers: { "x-user-email": userEmail } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch failed"))))
      .then((list: Record<string, unknown>[]) => {
        if (!mounted) return;
        const code = codeFromLabel(entry.entityLabel);
        const found =
          list.find((row) => entry.entityKey && String(row[config.keyField]) === entry.entityKey) ??
          (config.codeField && code
            ? list.find((row) => String(row[config.codeField as string]) === code)
            : undefined);
        if (found) {
          setItem(found);
          setLoadState("loaded");
        } else {
          setLoadState("notfound");
        }
      })
      .catch(() => {
        if (mounted) setLoadState("error");
      });
    return () => {
      mounted = false;
    };
  }, [config, userEmail, entry.entityKey, entry.entityLabel]);

  const order = entry.entityType === "objectives" ? OBJECTIVE_FIELD_ORDER : KR_FIELD_ORDER;
  const fields = item ? orderedEntries(item, order) : [];

  return (
    <div className="act-popup-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="act-popup" onClick={(e) => e.stopPropagation()}>
        <div className="act-popup-header">
          <div>
            <span className={actionClass(entry.httpMethod)}>{composeActionSentence(entry)}</span>
            {entry.entityLabel && (
              <span className="act-popup-entity">{entry.entityLabel}</span>
            )}
          </div>
          <button type="button" className="act-popup-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="act-popup-meta">
          <span>{entry.userEmail}</span>
          <span>{new Date(entry.occurredAt).toLocaleString()}</span>
        </div>

        {config ? (
          <div className="act-popup-details">
            <div className="act-popup-changes-heading">
              {entry.entityType === "objectives" ? "Objective details" : "Key result details"}
            </div>
            {loadState === "loading" && <div className="act-popup-no-changes">Loading details…</div>}
            {loadState === "error" && (
              <div className="act-popup-no-changes">Couldn&rsquo;t load the current details.</div>
            )}
            {loadState === "notfound" && (
              <div className="act-popup-no-changes">
                This item no longer exists on the board (it may have been deleted).
              </div>
            )}
            {loadState === "loaded" && (
              <dl className="act-popup-fields">
                {fields.map(([key, value]) => (
                  <div key={key} className="act-popup-field-row">
                    <dt className="act-popup-field-label">{friendlyFieldName(key)}</dt>
                    <dd className="act-popup-field-value">{formatValue(value, key)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        ) : changes.length > 0 ? (
          <div className="act-popup-changes">
            <div className="act-popup-changes-heading">Changes</div>
            {changes.map((c) => (
              <div key={c.field} className="act-popup-change-row">
                <div className="act-popup-change-field">{friendlyFieldName(c.field)}</div>
                <div className="act-popup-change-values">
                  <span className="act-change-from">{formatValue(c.from, c.field)}</span>
                  <span className="act-change-arrow">→</span>
                  <span className="act-change-to">{formatValue(c.to, c.field)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="act-popup-no-changes">No field-level changes recorded for this event.</div>
        )}
      </div>
    </div>
  );
}

function HorizontalBar({ label, count, max }: { label: string; count: number; max: number }): JSX.Element {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="act-hbar-row">
      <span className="act-hbar-label">{label}</span>
      <div className="act-hbar-track">
        <div className="act-hbar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="act-hbar-count">{count}</span>
    </div>
  );
}

export default function ActivityPage(): JSX.Element {
  const currentUserEmail = useCurrentUserEmail();
  const router = useRouter();

  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [period, setPeriod] = useState<Period>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [filterEntityType, setFilterEntityType] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInsights, setShowInsights] = useState(false);
  const [insightsEntries, setInsightsEntries] = useState<ActivityEntry[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<ActivityEntry | null>(null);

  const fetchRef = useRef(0);

  useEffect(() => {
    if (!currentUserEmail) return;
    let mounted = true;
    fetch(apiPath("/api/authz/me"), { headers: { "x-user-email": currentUserEmail } })
      .then((r) => r.json())
      .then((payload: { role?: string | null }) => {
        if (!mounted) return;
        const role = payload.role;
        setAuthorized(role === "Admin" || role === "Manager");
      })
      .catch(() => { if (mounted) setAuthorized(false); });
    return () => { mounted = false; };
  }, [currentUserEmail]);

  const buildQuery = useCallback((cursor?: string): string => {
    const params = new URLSearchParams();
    if (period !== "custom") {
      params.set("period", period);
    } else {
      if (customFrom) params.set("from", customFrom + "T00:00:00.000Z");
      if (customTo) params.set("to", customTo + "T23:59:59.999Z");
    }
    if (filterEntityType) params.set("entityType", filterEntityType);
    if (filterUser) params.set("userEmail", filterUser);
    params.set("limit", "50");
    if (cursor) params.set("cursor", cursor);
    return params.toString();
  }, [period, customFrom, customTo, filterEntityType, filterUser]);

  const fetchPage = useCallback(async (cursor?: string) => {
    if (!currentUserEmail) return;
    const fetchId = ++fetchRef.current;
    if (!cursor) {
      setLoading(true);
      setEntries([]);
      setNextCursor(null);
      setError(null);
    } else {
      setLoadingMore(true);
    }

    try {
      const qs = buildQuery(cursor);
      const res = await fetch(apiPath(`/api/activity?${qs}`), {
        headers: { "x-user-email": currentUserEmail }
      });
      if (fetchRef.current !== fetchId) return;
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        setError(body.error ?? "Failed to load activity.");
        return;
      }
      const page = await res.json() as ActivityPage;
      if (fetchRef.current !== fetchId) return;
      setEntries((prev) => cursor ? [...prev, ...page.entries] : page.entries);
      setNextCursor(page.nextCursor);
    } catch {
      if (fetchRef.current === fetchId) setError("Failed to load activity.");
    } finally {
      if (fetchRef.current === fetchId) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [currentUserEmail, buildQuery]);

  const fetchInsights = useCallback(async () => {
    if (!currentUserEmail) return;
    setInsightsLoading(true);
    let all: ActivityEntry[] = [];
    let cursor: string | undefined;
    try {
      while (true) {
        const params = new URLSearchParams();
        if (period !== "custom") {
          params.set("period", period);
        } else {
          if (customFrom) params.set("from", customFrom + "T00:00:00.000Z");
          if (customTo) params.set("to", customTo + "T23:59:59.999Z");
        }
        params.set("limit", "200");
        if (cursor) params.set("cursor", cursor);
        const res = await fetch(apiPath(`/api/activity?${params.toString()}`), {
          headers: { "x-user-email": currentUserEmail }
        });
        if (!res.ok) break;
        const page = await res.json() as ActivityPage;
        all = [...all, ...page.entries];
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }
    } catch { /* ignore */ }
    setInsightsEntries(all);
    setInsightsLoading(false);
  }, [currentUserEmail, period, customFrom, customTo]);

  useEffect(() => {
    if (authorized === true) void fetchPage();
  }, [authorized, fetchPage]);

  useEffect(() => {
    if (showInsights && authorized === true) void fetchInsights();
  }, [showInsights, authorized, fetchInsights]);

  const grouped = useMemo(() => {
    const map = new Map<string, ActivityEntry[]>();
    for (const e of entries) {
      const day = isoDay(e.occurredAt);
      const arr = map.get(day) ?? [];
      arr.push(e);
      map.set(day, arr);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  const dailyBuckets = useMemo(() => buildDailyBuckets(insightsEntries), [insightsEntries]);
  const entityTypeCounts = useMemo(() => buildEntityTypeCounts(insightsEntries), [insightsEntries]);
  const topUsers = useMemo(() => buildTopUsers(insightsEntries), [insightsEntries]);
  const topEntities = useMemo(() => buildTopEntities(insightsEntries), [insightsEntries]);

  if (authorized === null || !currentUserEmail) {
    return (
      <div className="act-page">
        <div className="act-loading">Loading…</div>
      </div>
    );
  }

  if (authorized === false) {
    return (
      <div className="act-page">
        <div className="act-forbidden">
          <h1>Access Restricted</h1>
          <p>The Activity Log is only available to Managers and Admins.</p>
          <button type="button" className="btn-secondary" onClick={() => router.push("/")}>
            Go to OKR Board
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="act-page">
      {selectedEntry && (
        <DetailPopup
          entry={selectedEntry}
          userEmail={currentUserEmail}
          onClose={() => setSelectedEntry(null)}
        />
      )}
      <div className="act-header">
        <h1 className="act-title">Activity Log</h1>
        <button
          type="button"
          className={`btn-secondary act-insights-toggle ${showInsights ? "active" : ""}`}
          onClick={() => setShowInsights((v) => !v)}
        >
          {showInsights ? "Hide Insights" : "Show Insights"}
        </button>
      </div>

      {/* Filters */}
      <div className="act-filters">
        <div className="act-filter-group">
          <label className="act-filter-label">Period</label>
          <select
            className="act-select"
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
          >
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <option key={p} value={p}>{PERIOD_LABELS[p]}</option>
            ))}
          </select>
        </div>

        {period === "custom" && (
          <>
            <div className="act-filter-group">
              <label className="act-filter-label">From</label>
              <input
                type="date"
                className="act-input"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </div>
            <div className="act-filter-group">
              <label className="act-filter-label">To</label>
              <input
                type="date"
                className="act-input"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
          </>
        )}

        <div className="act-filter-group">
          <label className="act-filter-label">Entity type</label>
          <select
            className="act-select"
            value={filterEntityType}
            onChange={(e) => setFilterEntityType(e.target.value)}
          >
            <option value="">All</option>
            <option value="objectives">Objectives</option>
            <option value="krs">Key Results</option>
            <option value="milestones">Milestones</option>
            <option value="periods">Periods</option>
            <option value="ventures">Ventures</option>
          </select>
        </div>

        <div className="act-filter-group">
          <label className="act-filter-label">User email</label>
          <input
            type="email"
            className="act-input"
            placeholder="filter by email"
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
          />
        </div>

        <button
          type="button"
          className="btn-primary act-apply-btn"
          onClick={() => {
            void fetchPage();
            if (showInsights) void fetchInsights();
          }}
          disabled={loading}
        >
          Apply
        </button>
      </div>

      {/* Insights panel */}
      {showInsights && (
        <div className="act-insights">
          {insightsLoading ? (
            <div className="act-loading">Loading insights…</div>
          ) : (
            <>
              <div className="act-insights-stats">
                <div className="act-stat-card">
                  <div className="act-stat-value">{insightsEntries.length}</div>
                  <div className="act-stat-label">Total events</div>
                </div>
                <div className="act-stat-card">
                  <div className="act-stat-value">
                    {new Set(insightsEntries.map((e) => e.userEmail)).size}
                  </div>
                  <div className="act-stat-label">Active users</div>
                </div>
                <div className="act-stat-card">
                  <div className="act-stat-value">
                    {new Set(insightsEntries.map((e) => isoDay(e.occurredAt))).size}
                  </div>
                  <div className="act-stat-label">Active days</div>
                </div>
                <div className="act-stat-card">
                  <div className="act-stat-value">
                    {insightsEntries.filter((e) => e.httpMethod === "POST").length}
                  </div>
                  <div className="act-stat-label">Items created</div>
                </div>
              </div>

              {dailyBuckets.length > 0 && (
                <div className="act-insights-section">
                  <h3 className="act-insights-heading">Daily activity volume</h3>
                  <BarChart data={dailyBuckets} />
                </div>
              )}

              <div className="act-insights-cols">
                {entityTypeCounts.length > 0 && (
                  <div className="act-insights-section act-insights-section-col">
                    <h3 className="act-insights-heading">By entity type</h3>
                    {entityTypeCounts.map((d) => (
                      <HorizontalBar key={d.type} label={d.type} count={d.count} max={entityTypeCounts[0].count} />
                    ))}
                  </div>
                )}

                {topUsers.length > 0 && (
                  <div className="act-insights-section act-insights-section-col">
                    <h3 className="act-insights-heading">Top users</h3>
                    {topUsers.map((d) => (
                      <HorizontalBar key={d.email} label={d.email} count={d.count} max={topUsers[0].count} />
                    ))}
                  </div>
                )}

                {topEntities.length > 0 && (
                  <div className="act-insights-section act-insights-section-col">
                    <h3 className="act-insights-heading">Most changed items</h3>
                    {topEntities.map((d) => (
                      <HorizontalBar key={d.label} label={d.label} count={d.count} max={topEntities[0].count} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Feed */}
      {loading ? (
        <div className="act-loading">Loading activity…</div>
      ) : error ? (
        <div className="act-error">{error}</div>
      ) : grouped.length === 0 ? (
        <div className="act-empty">No activity found for this period.</div>
      ) : (
        <div className="act-feed">
          {grouped.map(([day, dayEntries]) => (
            <div key={day} className="act-day-group">
              <div className="act-day-heading">{formatDayHeading(dayEntries[0].occurredAt)}</div>
              {dayEntries.map((entry) => {
                const changes = parseChanges(entry.detailsJson);
                const actionSentence = composeActionSentence(entry);
                const entityDisplay = entry.entityLabel || null;

                return (
                  <button
                    key={entry.activityLogKey}
                    type="button"
                    className="act-entry act-entry-btn"
                    onClick={() => setSelectedEntry(entry)}
                    title="Click to see full details"
                  >
                    <div className="act-entry-time">{formatTime(entry.occurredAt)}</div>
                    <div className="act-entry-body">
                      <div className="act-entry-header">
                        <span className={actionClass(entry.httpMethod)}>{actionSentence}</span>
                        {entityDisplay ? (
                          <span className="act-entry-entity">{entityDisplay}</span>
                        ) : null}
                        <span className="act-entry-user">{entry.userEmail}</span>
                      </div>
                      {changes.length > 0 && (
                        <div className="act-changes">
                          {changes.map((c) => (
                            <div key={c.field} className="act-change-row">
                              <span className="act-change-field">{friendlyFieldName(c.field)}</span>
                              <span className="act-change-separator">changed from</span>
                              <span className="act-change-from">{formatValue(c.from, c.field)}</span>
                              <span className="act-change-arrow">to</span>
                              <span className="act-change-to">{formatValue(c.to, c.field)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {nextCursor && !loading && (
        <div className="act-load-more">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void fetchPage(nextCursor)}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
