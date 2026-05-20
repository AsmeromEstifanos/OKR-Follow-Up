"use client";

import useCurrentUserEmail from "@/app/use-current-user-email";
import { apiPath, withBasePath } from "@/lib/base-path";
import Link from "next/link";
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

function parseChanges(detailsJson: string | undefined): FieldChange[] {
  if (!detailsJson) return [];
  try {
    const parsed = JSON.parse(detailsJson) as { changes?: FieldChange[] };
    return parsed.changes ?? [];
  } catch {
    return [];
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value || "—";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return JSON.stringify(value);
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

function entityHref(entityType: string | undefined, entityKey: string | undefined): string | null {
  if (!entityType || !entityKey) return null;
  if (entityType === "objectives") return withBasePath(`/objectives/${entityKey}`);
  if (entityType === "krs") return withBasePath(`/objectives/${entityKey}`);
  return null;
}

function methodBadgeClass(method: string): string {
  if (method === "POST") return "act-badge act-badge-post";
  if (method === "PATCH") return "act-badge act-badge-patch";
  if (method === "DELETE") return "act-badge act-badge-delete";
  return "act-badge act-badge-get";
}

// Aggregate counts per day for the bar chart
function buildDailyBuckets(entries: ActivityEntry[]): { day: string; count: number }[] {
  const map = new Map<string, number>();
  for (const e of entries) {
    const d = isoDay(e.occurredAt);
    map.set(d, (map.get(d) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day));
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

// Simple SVG bar chart
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
  const [allEntries, setAllEntries] = useState<ActivityEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInsights, setShowInsights] = useState(false);
  const [insightsEntries, setInsightsEntries] = useState<ActivityEntry[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);

  const fetchRef = useRef(0);

  // Auth check
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
      setAllEntries([]);
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
      setAllEntries((prev) => cursor ? [...prev, ...page.entries] : page.entries);
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

  // Fetch all entries for insights (no limit)
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

  // Group entries by day
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

  const dailyBuckets = useMemo(() => {
    const raw = buildDailyBuckets(insightsEntries);
    return raw.map((d) => ({ label: d.day.slice(5), count: d.count }));
  }, [insightsEntries]);

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
            <option value="check-ins">Check-ins</option>
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
                const href = entityHref(entry.entityType, entry.entityKey);
                return (
                  <div key={entry.activityLogKey} className="act-entry">
                    <div className="act-entry-time">{formatTime(entry.occurredAt)}</div>
                    <div className="act-entry-body">
                      <div className="act-entry-header">
                        <span className={methodBadgeClass(entry.httpMethod)}>{entry.httpMethod}</span>
                        <span className="act-entry-action">{entry.activityName}</span>
                        {href ? (
                          <Link href={href} className="act-entry-entity">
                            {entry.entityLabel ?? entry.entityKey ?? ""}
                          </Link>
                        ) : entry.entityLabel ? (
                          <span className="act-entry-entity-plain">{entry.entityLabel}</span>
                        ) : null}
                        <span className="act-entry-user">{entry.userEmail}</span>
                      </div>
                      {changes.length > 0 && (
                        <div className="act-changes">
                          {changes.map((c) => (
                            <div key={c.field} className="act-change-row">
                              <span className="act-change-field">{c.field}</span>
                              <span className="act-change-from">{formatValue(c.from)}</span>
                              <span className="act-change-arrow">→</span>
                              <span className="act-change-to">{formatValue(c.to)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
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
