import type { CheckIn, KeyResult, Objective, Period, RagThresholds, Venture } from "@/lib/types";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const DEFAULT_LIST_PREFIX = "OKR Follow Up Store";
const LEGACY_VENTURES_RECORD_KEY = "ventures";
const LEGACY_CONTENT_RECORD_KEY = "content";
const RAG_CONFIG_KEY = "ragThresholds";

type PersistedContent = {
  ragThresholds?: RagThresholds;
  periods: Period[];
  objectives: Objective[];
  keyResults: KeyResult[];
  checkIns: CheckIn[];
};

export type SharePointStoreSnapshot = {
  ventures: Venture[];
  content: PersistedContent;
};

type SharePointStorageConfig = {
  enabled: boolean;
  reason: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  siteUrl: string;
  listName: string;
};

type GraphTokenResponse = {
  access_token: string;
  expires_in: number;
};

type GraphSiteResponse = {
  id: string;
};

type GraphList = {
  id: string;
  displayName: string;
};

type GraphListResponse = {
  value?: GraphList[];
};

type GraphColumnResponse = {
  value?: Array<{
    name?: string;
  }>;
};

type GraphListItem = {
  id: string;
  fields?: Record<string, unknown>;
};

type GraphListItemResponse = {
  value?: GraphListItem[];
  "@odata.nextLink"?: string;
};

type ColumnDefinition = {
  name: string;
  type: "text" | "multilineText" | "number";
  optional?: boolean;
};

type ListDefinition = {
  suffix: string;
  keyField: string;
  columns: ColumnDefinition[];
};

type AtomicListName =
  | "ventures"
  | "departments"
  | "periods"
  | "objectives"
  | "keyResults"
  | "checkIns"
  | "config";

const LIST_DEFS: Record<AtomicListName, ListDefinition> = {
  ventures: {
    suffix: "Ventures",
    keyField: "VentureKey",
    columns: [
      { name: "VentureKey", type: "text" },
      { name: "VentureName", type: "text" }
    ]
  },
  departments: {
    suffix: "Departments",
    keyField: "DepartmentKey",
    columns: [
      { name: "DepartmentKey", type: "text" },
      { name: "VentureKey", type: "text" },
      { name: "DepartmentName", type: "text" }
    ]
  },
  periods: {
    suffix: "Periods",
    keyField: "PeriodKey",
    columns: [
      { name: "PeriodKey", type: "text" },
      { name: "PeriodName", type: "text" },
      { name: "StartDate", type: "text" },
      { name: "EndDate", type: "text" },
      { name: "Status", type: "text" }
    ]
  },
  objectives: {
    suffix: "Objectives",
    keyField: "ObjectiveKey",
    columns: [
      { name: "ObjectiveKey", type: "text" },
      { name: "ObjectiveCode", type: "text", optional: true },
      { name: "PeriodKey", type: "text" },
      { name: "ObjectiveTitle", type: "text" },
      { name: "Description", type: "multilineText" },
      { name: "Owner", type: "text" },
      { name: "OwnerEmail", type: "text", optional: true },
      { name: "Department", type: "text" },
      { name: "VentureName", type: "text", optional: true },
      { name: "StrategicTheme", type: "text" },
      { name: "ObjectiveType", type: "text" },
      { name: "OkrCycle", type: "text" },
      { name: "Blockers", type: "multilineText", optional: true },
      { name: "KeyRisksDependency", type: "multilineText" },
      { name: "Notes", type: "multilineText" },
      { name: "Status", type: "text" },
      { name: "ProgressPct", type: "number" },
      { name: "Confidence", type: "text" },
      { name: "Rag", type: "text" },
      { name: "StartDate", type: "text" },
      { name: "EndDate", type: "text" },
      { name: "LastCheckinAt", type: "text" }
    ]
  },
  keyResults: {
    suffix: "Key Results",
    keyField: "KrKey",
    columns: [
      { name: "KrKey", type: "text" },
      { name: "KrCode", type: "text", optional: true },
      { name: "ObjectiveKey", type: "text" },
      { name: "PeriodKey", type: "text" },
      { name: "KrTitle", type: "text" },
      { name: "Owner", type: "text" },
      { name: "OwnerEmail", type: "text", optional: true },
      { name: "MetricType", type: "text" },
      { name: "BaselineValue", type: "number" },
      { name: "TargetValue", type: "number" },
      { name: "CurrentValue", type: "number" },
      { name: "ProgressPct", type: "number" },
      { name: "Status", type: "text" },
      { name: "DueDate", type: "text" },
      { name: "CheckInFrequency", type: "text" },
      { name: "Blockers", type: "multilineText", optional: true },
      { name: "Notes", type: "multilineText" },
      { name: "LastCheckinAt", type: "text" }
    ]
  },
  checkIns: {
    suffix: "Check-Ins",
    keyField: "CheckInKey",
    columns: [
      { name: "CheckInKey", type: "text" },
      { name: "CheckInAt", type: "text" },
      { name: "PeriodKey", type: "text" },
      { name: "ObjectiveKey", type: "text" },
      { name: "KrKey", type: "text" },
      { name: "Owner", type: "text" },
      { name: "Status", type: "text" },
      { name: "Confidence", type: "text" },
      { name: "UpdateNotes", type: "multilineText" },
      { name: "Blockers", type: "multilineText" },
      { name: "SupportNeeded", type: "multilineText" },
      { name: "CurrentValueSnapshot", type: "number" },
      { name: "ProgressPctSnapshot", type: "number" },
      { name: "AttachmentsJson", type: "multilineText" }
    ]
  },
  config: {
    suffix: "Config",
    keyField: "ConfigKey",
    columns: [
      { name: "ConfigKey", type: "text" },
      { name: "GreenMin", type: "number" },
      { name: "AmberMin", type: "number" }
    ]
  }
};

const cache = globalThis as {
  __okrSharePointAppToken?: {
    value: string;
    expiresAt: number;
  };
  __okrSharePointSiteId?: string;
  __okrSharePointListIds?: Record<string, string>;
};

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
}

function getStorageConfig(): SharePointStorageConfig {
  const tenantId = firstNonEmpty(
    process.env.AZURE_APP_TENANT_ID,
    process.env.AZURE_TENANT_ID,
    process.env.NEXT_PUBLIC_AAD_TENANT_ID,
    process.env.REACT_APP_AAD_TENANT_ID
  );
  const clientId = firstNonEmpty(
    process.env.AZURE_APP_CLIENT_ID,
    process.env.AZURE_CLIENT_ID,
    process.env.NEXT_PUBLIC_AZURE_CLIENT_ID,
    process.env.REACT_APP_AZURE_CLIENT_ID
  );
  const clientSecret = firstNonEmpty(process.env.AZURE_APP_CLIENT_SECRET, process.env.AZURE_CLIENT_SECRET);
  const siteUrl = firstNonEmpty(
    process.env.SHAREPOINT_SITE_URL,
    process.env.NEXT_PUBLIC_SHAREPOINT_SITE_URL,
    process.env.REACT_APP_SHAREPOINT_SITE_URL
  );
  const listName =
    firstNonEmpty(
      process.env.SHAREPOINT_STORAGE_LIST,
      process.env.NEXT_PUBLIC_SHAREPOINT_STORAGE_LIST,
      process.env.REACT_APP_SHAREPOINT_STORAGE_LIST
    ) || DEFAULT_LIST_PREFIX;

  if (!tenantId) {
    return { enabled: false, reason: "Missing tenant id.", tenantId, clientId, clientSecret, siteUrl, listName };
  }
  if (!clientId) {
    return { enabled: false, reason: "Missing Azure client id.", tenantId, clientId, clientSecret, siteUrl, listName };
  }
  if (!clientSecret) {
    return { enabled: false, reason: "Missing Azure client secret.", tenantId, clientId, clientSecret, siteUrl, listName };
  }
  if (!siteUrl) {
    return { enabled: false, reason: "Missing SharePoint site URL.", tenantId, clientId, clientSecret, siteUrl, listName };
  }

  return { enabled: true, reason: "", tenantId, clientId, clientSecret, siteUrl, listName };
}

export function getSharePointStorageStatus(): {
  enabled: boolean;
  reason: string;
  siteUrl: string;
  listName: string;
} {
  const config = getStorageConfig();
  return {
    enabled: config.enabled,
    reason: config.reason,
    siteUrl: config.siteUrl,
    listName: config.listName
  };
}

function buildSiteIdentifier(siteUrl: string): string {
  const parsed = new URL(siteUrl);
  const pathname = parsed.pathname || "/";
  return `${parsed.hostname}:${pathname}`;
}

async function acquireGraphAppToken(config: SharePointStorageConfig): Promise<string> {
  const cached = cache.__okrSharePointAppToken;
  const now = Date.now();
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.value;
  }

  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default"
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store"
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Failed to acquire Graph app token: ${response.status} ${response.statusText} ${message}`);
  }

  const payload = (await response.json()) as GraphTokenResponse;
  cache.__okrSharePointAppToken = {
    value: payload.access_token,
    expiresAt: now + Math.max(120, payload.expires_in) * 1000
  };

  return payload.access_token;
}

async function graphRequest(config: SharePointStorageConfig, pathOrUrl: string, init: RequestInit = {}): Promise<Response> {
  const token = await acquireGraphAppToken(config);
  const target = pathOrUrl.startsWith("http") ? pathOrUrl : `${GRAPH_BASE_URL}${pathOrUrl}`;

  return fetch(target, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    },
    cache: "no-store"
  });
}

function assertResponseOk(response: Response, context: string, body: string): void {
  if (response.ok) {
    return;
  }

  throw new Error(`${context} failed: ${response.status} ${response.statusText} ${body}`);
}

function parseGraphErrorCode(rawBody: string): string {
  try {
    const payload = JSON.parse(rawBody) as {
      error?: {
        code?: string;
      };
    };
    return (payload.error?.code ?? "").trim().toLowerCase();
  } catch {
    return "";
  }
}

function shouldIgnoreColumnCreateFailure(column: ColumnDefinition, response: Response, rawBody: string): boolean {
  const errorCode = parseGraphErrorCode(rawBody);

  if (response.status === 409 || errorCode === "namealreadyexists") {
    return true;
  }

  if (!column.optional) {
    return false;
  }

  if (response.status === 401 || response.status === 403) {
    return true;
  }

  return errorCode === "accessdenied" || errorCode === "authorization_requestdenied";
}

async function resolveSiteId(config: SharePointStorageConfig): Promise<string> {
  if (cache.__okrSharePointSiteId) {
    return cache.__okrSharePointSiteId;
  }

  const identifier = buildSiteIdentifier(config.siteUrl);
  const response = await graphRequest(config, `/sites/${identifier}`, { method: "GET" });
  const raw = await response.text();
  assertResponseOk(response, "Resolve SharePoint site", raw);

  const site = JSON.parse(raw) as GraphSiteResponse;
  if (!site.id) {
    throw new Error("SharePoint site response did not include an id.");
  }

  cache.__okrSharePointSiteId = site.id;
  return site.id;
}

function getListCacheKey(siteId: string, displayName: string): string {
  return `${siteId}::${displayName.toLowerCase()}`;
}

function buildListName(config: SharePointStorageConfig, listName: AtomicListName): string {
  return `${config.listName} ${LIST_DEFS[listName].suffix}`;
}

function buildColumn(column: ColumnDefinition): Record<string, unknown> {
  if (column.type === "multilineText") {
    return { name: column.name, text: { allowMultipleLines: true } };
  }

  if (column.type === "number") {
    return { name: column.name, number: {} };
  }

  return { name: column.name, text: {} };
}

async function listSiteLists(config: SharePointStorageConfig, siteId: string): Promise<GraphList[]> {
  const response = await graphRequest(config, `/sites/${siteId}/lists?$select=id,displayName`, { method: "GET" });
  const raw = await response.text();
  assertResponseOk(response, "SharePoint list lookup", raw);

  const payload = JSON.parse(raw) as GraphListResponse;
  return payload.value ?? [];
}

async function ensureListColumns(
  config: SharePointStorageConfig,
  siteId: string,
  listId: string,
  columns: ColumnDefinition[]
): Promise<void> {
  const response = await graphRequest(config, `/sites/${siteId}/lists/${listId}/columns?$select=name`, { method: "GET" });
  const raw = await response.text();
  assertResponseOk(response, "List column lookup", raw);

  const payload = JSON.parse(raw) as GraphColumnResponse;
  const existing = new Set((payload.value ?? []).map((column) => (column.name ?? "").toLowerCase()));

  for (const column of columns) {
    if (existing.has(column.name.toLowerCase())) {
      continue;
    }

    const createResponse = await graphRequest(config, `/sites/${siteId}/lists/${listId}/columns`, {
      method: "POST",
      body: JSON.stringify(buildColumn(column))
    });
    const createRaw = await createResponse.text();
    if (!createResponse.ok) {
      if (shouldIgnoreColumnCreateFailure(column, createResponse, createRaw)) {
        continue;
      }

      assertResponseOk(createResponse, `Create column '${column.name}'`, createRaw);
    }
  }
}

async function ensureList(
  config: SharePointStorageConfig,
  siteId: string,
  displayName: string,
  definition: ListDefinition
): Promise<string> {
  const cacheKey = getListCacheKey(siteId, displayName);
  if (cache.__okrSharePointListIds?.[cacheKey]) {
    return cache.__okrSharePointListIds[cacheKey];
  }

  const lists = await listSiteLists(config, siteId);
  const existing = lists.find((list) => list.displayName.toLowerCase() === displayName.toLowerCase());

  if (existing) {
    await ensureListColumns(config, siteId, existing.id, definition.columns);
    cache.__okrSharePointListIds = {
      ...(cache.__okrSharePointListIds ?? {}),
      [cacheKey]: existing.id
    };
    return existing.id;
  }

  const createResponse = await graphRequest(config, `/sites/${siteId}/lists`, {
    method: "POST",
    body: JSON.stringify({
      displayName,
      columns: definition.columns.map(buildColumn),
      list: { template: "genericList" }
    })
  });
  const createRaw = await createResponse.text();
  assertResponseOk(createResponse, `Create SharePoint list '${displayName}'`, createRaw);

  const created = JSON.parse(createRaw) as GraphList;
  if (!created.id) {
    throw new Error(`Create SharePoint list '${displayName}' succeeded but list id was missing.`);
  }

  cache.__okrSharePointListIds = {
    ...(cache.__okrSharePointListIds ?? {}),
    [cacheKey]: created.id
  };
  return created.id;
}

type AtomicTargets = {
  siteId: string;
  listIds: Record<AtomicListName, string>;
};

async function ensureAtomicTargets(config: SharePointStorageConfig): Promise<AtomicTargets> {
  const siteId = await resolveSiteId(config);
  const listIds = {} as Record<AtomicListName, string>;

  for (const listName of Object.keys(LIST_DEFS) as AtomicListName[]) {
    listIds[listName] = await ensureList(config, siteId, buildListName(config, listName), LIST_DEFS[listName]);
  }

  return { siteId, listIds };
}

function escapeFilterString(value: string): string {
  return value.replace(/'/g, "''");
}

function asString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "";
}

function asNullableString(value: unknown): string | null {
  const normalized = asString(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function asOwnerEmail(ownerEmailValue: unknown, ownerValue: unknown): string {
  const explicit = asString(ownerEmailValue).trim();
  if (explicit) {
    return explicit;
  }

  const owner = asString(ownerValue).trim();
  return owner.includes("@") ? owner : "";
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(asString(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toFieldRecord(fields: Record<string, unknown>): Record<string, string | number | null> {
  const output: Record<string, string | number | null> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) {
      continue;
    }

    if (value === null) {
      output[key] = null;
    } else if (typeof value === "number") {
      output[key] = Number.isFinite(value) ? value : 0;
    } else if (typeof value === "string") {
      output[key] = value;
    } else {
      output[key] = JSON.stringify(value);
    }
  }

  return output;
}

async function listItems(
  config: SharePointStorageConfig,
  siteId: string,
  listId: string,
  selectFields: string[]
): Promise<GraphListItem[]> {
  const query = new URLSearchParams();
  query.set("$expand", `fields($select=${selectFields.join(",")})`);
  query.set("$top", "999");

  let nextUrl = `${GRAPH_BASE_URL}/sites/${siteId}/lists/${listId}/items?${query.toString()}`;
  const items: GraphListItem[] = [];

  while (nextUrl) {
    const response = await graphRequest(config, nextUrl, { method: "GET" });
    const raw = await response.text();
    assertResponseOk(response, "List items lookup", raw);

    const payload = JSON.parse(raw) as GraphListItemResponse;
    if (Array.isArray(payload.value)) {
      items.push(...payload.value);
    }

    nextUrl = typeof payload["@odata.nextLink"] === "string" ? payload["@odata.nextLink"] : "";
  }

  return items;
}

async function createItem(
  config: SharePointStorageConfig,
  siteId: string,
  listId: string,
  fields: Record<string, string | number | null>
): Promise<void> {
  const response = await graphRequest(config, `/sites/${siteId}/lists/${listId}/items`, {
    method: "POST",
    body: JSON.stringify({ fields })
  });
  const raw = await response.text();
  assertResponseOk(response, "Create list item", raw);
}

async function updateItem(
  config: SharePointStorageConfig,
  siteId: string,
  listId: string,
  itemId: string,
  fields: Record<string, string | number | null>
): Promise<void> {
  const response = await graphRequest(config, `/sites/${siteId}/lists/${listId}/items/${itemId}/fields`, {
    method: "PATCH",
    body: JSON.stringify(fields)
  });
  const raw = await response.text();
  assertResponseOk(response, "Update list item", raw);
}

async function deleteItem(config: SharePointStorageConfig, siteId: string, listId: string, itemId: string): Promise<void> {
  const response = await graphRequest(config, `/sites/${siteId}/lists/${listId}/items/${itemId}`, { method: "DELETE" });
  const raw = await response.text();
  assertResponseOk(response, "Delete list item", raw);
}

async function replaceListItems(
  config: SharePointStorageConfig,
  siteId: string,
  listId: string,
  keyField: string,
  rows: Array<Record<string, unknown>>
): Promise<void> {
  const existingItems = await listItems(config, siteId, listId, [keyField]);
  const existingByKey = new Map<string, string>();

  for (const item of existingItems) {
    const key = asString(item.fields?.[keyField]).trim();
    if (key) {
      existingByKey.set(key, item.id);
    }
  }

  const seen = new Set<string>();
  for (const row of rows) {
    const key = asString(row[keyField]).trim();
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    const existingId = existingByKey.get(key);
    const fields = toFieldRecord(row);

    if (existingId) {
      await updateItem(config, siteId, listId, existingId, fields);
      existingByKey.delete(key);
    } else {
      await createItem(config, siteId, listId, fields);
    }
  }

  for (const orphanId of existingByKey.values()) {
    await deleteItem(config, siteId, listId, orphanId);
  }
}

function buildCheckInKey(checkIn: Pick<CheckIn, "krKey" | "checkInAt">): string {
  return `${checkIn.krKey}::${checkIn.checkInAt}`;
}

function parseAttachments(value: unknown): string[] {
  const raw = asString(value).trim();
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

function parseSnapshotRecord(value: string | null): unknown {
  if (!value || !value.trim()) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

async function loadAtomicSnapshot(config: SharePointStorageConfig): Promise<SharePointStoreSnapshot | null> {
  const { siteId, listIds } = await ensureAtomicTargets(config);
  const hasObjectiveCodeColumn = await listHasColumn(config, siteId, listIds.objectives, "ObjectiveCode");
  const hasObjectiveVentureColumn = await listHasColumn(config, siteId, listIds.objectives, "VentureName");
  const hasObjectiveOwnerEmailColumn = await listHasColumn(config, siteId, listIds.objectives, "OwnerEmail");
  const hasObjectiveBlockersColumn = await listHasColumn(config, siteId, listIds.objectives, "Blockers");
  const hasKrCodeColumn = await listHasColumn(config, siteId, listIds.keyResults, "KrCode");
  const hasKrOwnerEmailColumn = await listHasColumn(config, siteId, listIds.keyResults, "OwnerEmail");
  const hasKrBlockersColumn = await listHasColumn(config, siteId, listIds.keyResults, "Blockers");
  const objectiveSelectFields = [
    "ObjectiveKey",
    ...(hasObjectiveCodeColumn ? ["ObjectiveCode"] : []),
    "PeriodKey",
    "ObjectiveTitle",
    "Description",
    "Owner",
    ...(hasObjectiveOwnerEmailColumn ? ["OwnerEmail"] : []),
    "Department",
    ...(hasObjectiveVentureColumn ? ["VentureName"] : []),
    "StrategicTheme",
    "ObjectiveType",
    "OkrCycle",
    ...(hasObjectiveBlockersColumn ? ["Blockers"] : []),
    "KeyRisksDependency",
    "Notes",
    "Status",
    "ProgressPct",
    "Confidence",
    "Rag",
    "StartDate",
    "EndDate",
    "LastCheckinAt"
  ];
  const keyResultSelectFields = [
    "KrKey",
    ...(hasKrCodeColumn ? ["KrCode"] : []),
    "ObjectiveKey",
    "PeriodKey",
    "KrTitle",
    "Owner",
    ...(hasKrOwnerEmailColumn ? ["OwnerEmail"] : []),
    "MetricType",
    "BaselineValue",
    "TargetValue",
    "CurrentValue",
    "ProgressPct",
    "Status",
    "DueDate",
    "CheckInFrequency",
    ...(hasKrBlockersColumn ? ["Blockers"] : []),
    "Notes",
    "LastCheckinAt"
  ];

  const [ventureItems, departmentItems, periodItems, objectiveItems, krItems, checkInItems, configItems] = await Promise.all([
    listItems(config, siteId, listIds.ventures, ["VentureKey", "VentureName"]),
    listItems(config, siteId, listIds.departments, ["DepartmentKey", "VentureKey", "DepartmentName"]),
    listItems(config, siteId, listIds.periods, ["PeriodKey", "PeriodName", "StartDate", "EndDate", "Status"]),
    listItems(config, siteId, listIds.objectives, objectiveSelectFields),
    listItems(config, siteId, listIds.keyResults, keyResultSelectFields),
    listItems(config, siteId, listIds.checkIns, [
      "CheckInAt",
      "PeriodKey",
      "ObjectiveKey",
      "KrKey",
      "Owner",
      "Status",
      "Confidence",
      "UpdateNotes",
      "Blockers",
      "SupportNeeded",
      "CurrentValueSnapshot",
      "ProgressPctSnapshot",
      "AttachmentsJson"
    ]),
    listItems(config, siteId, listIds.config, ["ConfigKey", "GreenMin", "AmberMin"])
  ]);

  const hasAnyData =
    ventureItems.length > 0 ||
    departmentItems.length > 0 ||
    periodItems.length > 0 ||
    objectiveItems.length > 0 ||
    krItems.length > 0 ||
    checkInItems.length > 0 ||
    configItems.length > 0;

  if (!hasAnyData) {
    return null;
  }

  const ventures = ventureItems
    .map((item) => {
      const ventureKey = asString(item.fields?.VentureKey).trim();
      if (!ventureKey) {
        return null;
      }

      return {
        ventureKey,
        name: asString(item.fields?.VentureName),
        departments: []
      } as Venture;
    })
    .filter((venture): venture is Venture => Boolean(venture));

  const ventureByKey = new Map<string, Venture>(ventures.map((venture) => [venture.ventureKey, venture]));
  for (const item of departmentItems) {
    const departmentKey = asString(item.fields?.DepartmentKey).trim();
    const ventureKey = asString(item.fields?.VentureKey).trim();
    if (!departmentKey || !ventureKey) {
      continue;
    }

    const venture = ventureByKey.get(ventureKey);
    if (venture) {
      venture.departments.push({ departmentKey, name: asString(item.fields?.DepartmentName) });
    }
  }

  const periods = periodItems
    .map((item) => {
      const periodKey = asString(item.fields?.PeriodKey).trim();
      if (!periodKey) {
        return null;
      }

      return {
        periodKey,
        name: asString(item.fields?.PeriodName),
        startDate: asString(item.fields?.StartDate),
        endDate: asString(item.fields?.EndDate),
        status: asString(item.fields?.Status) as Period["status"]
      } as Period;
    })
    .filter((period): period is Period => Boolean(period));

  const objectives = objectiveItems
    .map((item) => {
      const objectiveKey = asString(item.fields?.ObjectiveKey).trim();
      if (!objectiveKey) {
        return null;
      }

      return {
        objectiveKey,
        objectiveCode: asString(item.fields?.ObjectiveCode) || objectiveKey,
        periodKey: asString(item.fields?.PeriodKey),
        title: asString(item.fields?.ObjectiveTitle),
        description: asString(item.fields?.Description),
        owner: asString(item.fields?.Owner),
        ownerEmail: asOwnerEmail(item.fields?.OwnerEmail, item.fields?.Owner),
        department: asString(item.fields?.Department),
        ventureName: asString(item.fields?.VentureName),
        strategicTheme: asString(item.fields?.StrategicTheme),
        objectiveType: asString(item.fields?.ObjectiveType) as Objective["objectiveType"],
        okrCycle: asString(item.fields?.OkrCycle) as Objective["okrCycle"],
        blockers: asString(item.fields?.Blockers),
        keyRisksDependency: asString(item.fields?.KeyRisksDependency),
        notes: asString(item.fields?.Notes),
        status: asString(item.fields?.Status) as Objective["status"],
        progressPct: asNumber(item.fields?.ProgressPct, 0),
        confidence: asString(item.fields?.Confidence) as Objective["confidence"],
        rag: asString(item.fields?.Rag) as Objective["rag"],
        startDate: asString(item.fields?.StartDate),
        endDate: asString(item.fields?.EndDate),
        lastCheckinAt: asNullableString(item.fields?.LastCheckinAt)
      } as Objective;
    })
    .filter((objective): objective is Objective => Boolean(objective));

  const keyResults = krItems
    .map((item) => {
      const krKey = asString(item.fields?.KrKey).trim();
      if (!krKey) {
        return null;
      }

      return {
        krKey,
        krCode: asString(item.fields?.KrCode) || krKey,
        objectiveKey: asString(item.fields?.ObjectiveKey),
        periodKey: asString(item.fields?.PeriodKey),
        title: asString(item.fields?.KrTitle),
        owner: asString(item.fields?.Owner),
        ownerEmail: asOwnerEmail(item.fields?.OwnerEmail, item.fields?.Owner),
        metricType: asString(item.fields?.MetricType) as KeyResult["metricType"],
        baselineValue: asNumber(item.fields?.BaselineValue, 0),
        targetValue: asNumber(item.fields?.TargetValue, 0),
        currentValue: asNumber(item.fields?.CurrentValue, 0),
        progressPct: asNumber(item.fields?.ProgressPct, 0),
        status: asString(item.fields?.Status) as KeyResult["status"],
        dueDate: asString(item.fields?.DueDate),
        checkInFrequency: asString(item.fields?.CheckInFrequency) as KeyResult["checkInFrequency"],
        blockers: asString(item.fields?.Blockers),
        notes: asString(item.fields?.Notes),
        lastCheckinAt: asNullableString(item.fields?.LastCheckinAt)
      } as KeyResult;
    })
    .filter((kr): kr is KeyResult => Boolean(kr));

  const checkIns = checkInItems
    .map((item) => {
      const checkInAt = asString(item.fields?.CheckInAt).trim();
      const krKey = asString(item.fields?.KrKey).trim();
      if (!checkInAt || !krKey) {
        return null;
      }

      return {
        checkInAt,
        periodKey: asString(item.fields?.PeriodKey),
        objectiveKey: asString(item.fields?.ObjectiveKey),
        krKey,
        owner: asString(item.fields?.Owner),
        status: asString(item.fields?.Status) as CheckIn["status"],
        confidence: asString(item.fields?.Confidence) as CheckIn["confidence"],
        updateNotes: asString(item.fields?.UpdateNotes),
        blockers: asString(item.fields?.Blockers),
        supportNeeded: asString(item.fields?.SupportNeeded),
        currentValueSnapshot: asNumber(item.fields?.CurrentValueSnapshot, 0),
        progressPctSnapshot: asNumber(item.fields?.ProgressPctSnapshot, 0),
        attachments: parseAttachments(item.fields?.AttachmentsJson)
      } as CheckIn;
    })
    .filter((checkIn): checkIn is CheckIn => Boolean(checkIn));

  const ragItem =
    configItems.find((item) => asString(item.fields?.ConfigKey).trim().toLowerCase() === RAG_CONFIG_KEY.toLowerCase()) ??
    configItems[0];

  const ragThresholds = ragItem
    ? {
        greenMin: asNumber(ragItem.fields?.GreenMin, 0),
        amberMin: asNumber(ragItem.fields?.AmberMin, 0)
      }
    : undefined;

  return {
    ventures,
    content: {
      ragThresholds,
      periods,
      objectives,
      keyResults,
      checkIns
    }
  };
}

async function saveAtomicSnapshot(config: SharePointStorageConfig, snapshot: SharePointStoreSnapshot): Promise<void> {
  const { siteId, listIds } = await ensureAtomicTargets(config);
  const hasObjectiveCodeColumn = await listHasColumn(config, siteId, listIds.objectives, "ObjectiveCode");
  const hasObjectiveVentureColumn = await listHasColumn(config, siteId, listIds.objectives, "VentureName");
  const hasObjectiveOwnerEmailColumn = await listHasColumn(config, siteId, listIds.objectives, "OwnerEmail");
  const hasObjectiveBlockersColumn = await listHasColumn(config, siteId, listIds.objectives, "Blockers");
  const hasKrCodeColumn = await listHasColumn(config, siteId, listIds.keyResults, "KrCode");
  const hasKrOwnerEmailColumn = await listHasColumn(config, siteId, listIds.keyResults, "OwnerEmail");
  const hasKrBlockersColumn = await listHasColumn(config, siteId, listIds.keyResults, "Blockers");

  const ventureRows = snapshot.ventures.map((venture) => ({
    VentureKey: venture.ventureKey,
    VentureName: venture.name
  }));

  const departmentRows = snapshot.ventures.flatMap((venture) =>
    venture.departments.map((department) => ({
      DepartmentKey: department.departmentKey,
      VentureKey: venture.ventureKey,
      DepartmentName: department.name
    }))
  );

  const periodRows = snapshot.content.periods.map((period) => ({
    PeriodKey: period.periodKey,
    PeriodName: period.name,
    StartDate: period.startDate,
    EndDate: period.endDate,
    Status: period.status
  }));

  const objectiveRows = snapshot.content.objectives.map((objective) => ({
    ObjectiveKey: objective.objectiveKey,
    ...(hasObjectiveCodeColumn ? { ObjectiveCode: objective.objectiveCode ?? objective.objectiveKey } : {}),
    PeriodKey: objective.periodKey,
    ObjectiveTitle: objective.title,
    Description: objective.description,
    Owner: objective.owner,
    ...(hasObjectiveOwnerEmailColumn ? { OwnerEmail: objective.ownerEmail ?? "" } : {}),
    Department: objective.department,
    ...(hasObjectiveVentureColumn ? { VentureName: objective.ventureName ?? "" } : {}),
    StrategicTheme: objective.strategicTheme,
    ObjectiveType: objective.objectiveType,
    OkrCycle: objective.okrCycle,
    ...(hasObjectiveBlockersColumn ? { Blockers: objective.blockers ?? "" } : {}),
    KeyRisksDependency: objective.keyRisksDependency,
    Notes: objective.notes,
    Status: objective.status,
    ProgressPct: objective.progressPct,
    Confidence: objective.confidence,
    Rag: objective.rag,
    StartDate: objective.startDate,
    EndDate: objective.endDate,
    LastCheckinAt: objective.lastCheckinAt ?? ""
  }));

  const keyResultRows = snapshot.content.keyResults.map((kr) => ({
    KrKey: kr.krKey,
    ...(hasKrCodeColumn ? { KrCode: kr.krCode ?? kr.krKey } : {}),
    ObjectiveKey: kr.objectiveKey,
    PeriodKey: kr.periodKey,
    KrTitle: kr.title,
    Owner: kr.owner,
    ...(hasKrOwnerEmailColumn ? { OwnerEmail: kr.ownerEmail ?? "" } : {}),
    MetricType: kr.metricType,
    BaselineValue: kr.baselineValue,
    TargetValue: kr.targetValue,
    CurrentValue: kr.currentValue,
    ProgressPct: kr.progressPct,
    Status: kr.status,
    DueDate: kr.dueDate,
    CheckInFrequency: kr.checkInFrequency,
    ...(hasKrBlockersColumn ? { Blockers: kr.blockers ?? "" } : {}),
    Notes: kr.notes,
    LastCheckinAt: kr.lastCheckinAt ?? ""
  }));

  const checkInRows = snapshot.content.checkIns.map((checkIn) => ({
    CheckInKey: buildCheckInKey(checkIn),
    CheckInAt: checkIn.checkInAt,
    PeriodKey: checkIn.periodKey,
    ObjectiveKey: checkIn.objectiveKey,
    KrKey: checkIn.krKey,
    Owner: checkIn.owner,
    Status: checkIn.status,
    Confidence: checkIn.confidence,
    UpdateNotes: checkIn.updateNotes,
    Blockers: checkIn.blockers,
    SupportNeeded: checkIn.supportNeeded,
    CurrentValueSnapshot: checkIn.currentValueSnapshot,
    ProgressPctSnapshot: checkIn.progressPctSnapshot,
    AttachmentsJson: JSON.stringify(checkIn.attachments ?? [])
  }));

  const configRows = snapshot.content.ragThresholds
    ? [
        {
          ConfigKey: RAG_CONFIG_KEY,
          GreenMin: snapshot.content.ragThresholds.greenMin,
          AmberMin: snapshot.content.ragThresholds.amberMin
        }
      ]
    : [];

  await replaceListItems(config, siteId, listIds.ventures, LIST_DEFS.ventures.keyField, ventureRows);
  await replaceListItems(config, siteId, listIds.departments, LIST_DEFS.departments.keyField, departmentRows);
  await replaceListItems(config, siteId, listIds.periods, LIST_DEFS.periods.keyField, periodRows);
  await replaceListItems(config, siteId, listIds.objectives, LIST_DEFS.objectives.keyField, objectiveRows);
  await replaceListItems(config, siteId, listIds.keyResults, LIST_DEFS.keyResults.keyField, keyResultRows);
  await replaceListItems(config, siteId, listIds.checkIns, LIST_DEFS.checkIns.keyField, checkInRows);
  await replaceListItems(config, siteId, listIds.config, LIST_DEFS.config.keyField, configRows);
}

async function resolveLegacyListIdIfExists(config: SharePointStorageConfig, siteId: string): Promise<string | null> {
  const cacheKey = getListCacheKey(siteId, config.listName);
  if (cache.__okrSharePointListIds?.[cacheKey]) {
    return cache.__okrSharePointListIds[cacheKey];
  }

  const lists = await listSiteLists(config, siteId);
  const existing = lists.find((list) => list.displayName.toLowerCase() === config.listName.toLowerCase());
  if (!existing) {
    return null;
  }

  cache.__okrSharePointListIds = {
    ...(cache.__okrSharePointListIds ?? {}),
    [cacheKey]: existing.id
  };
  return existing.id;
}

async function listHasColumn(
  config: SharePointStorageConfig,
  siteId: string,
  listId: string,
  columnName: string
): Promise<boolean> {
  const response = await graphRequest(config, `/sites/${siteId}/lists/${listId}/columns?$select=name`, { method: "GET" });
  const raw = await response.text();
  assertResponseOk(response, "List column lookup", raw);

  const payload = JSON.parse(raw) as GraphColumnResponse;
  return (payload.value ?? []).some((column) => (column.name ?? "").toLowerCase() === columnName.toLowerCase());
}

async function readLegacyRecord(
  config: SharePointStorageConfig,
  siteId: string,
  listId: string,
  recordKey: string
): Promise<string | null> {
  const query = new URLSearchParams();
  query.set("$expand", "fields($select=Title,Payload)");
  query.set("$filter", `fields/Title eq '${escapeFilterString(recordKey)}'`);
  query.set("$top", "1");

  const response = await graphRequest(config, `/sites/${siteId}/lists/${listId}/items?${query.toString()}`, { method: "GET" });
  const raw = await response.text();
  assertResponseOk(response, `Read legacy record '${recordKey}'`, raw);

  const payload = JSON.parse(raw) as GraphListItemResponse;
  const item = payload.value?.[0];
  return asNullableString(item?.fields?.Payload);
}

async function loadLegacySnapshot(config: SharePointStorageConfig): Promise<SharePointStoreSnapshot | null> {
  const siteId = await resolveSiteId(config);
  const listId = await resolveLegacyListIdIfExists(config, siteId);
  if (!listId) {
    return null;
  }

  const hasPayloadColumn = await listHasColumn(config, siteId, listId, "Payload");
  if (!hasPayloadColumn) {
    return null;
  }

  const venturesRaw = await readLegacyRecord(config, siteId, listId, LEGACY_VENTURES_RECORD_KEY);
  const contentRaw = await readLegacyRecord(config, siteId, listId, LEGACY_CONTENT_RECORD_KEY);
  const venturesData = parseSnapshotRecord(venturesRaw);
  const contentData = parseSnapshotRecord(contentRaw);

  if (!Array.isArray(venturesData)) {
    return null;
  }

  if (!contentData || typeof contentData !== "object") {
    return null;
  }

  const typedContent = contentData as Partial<PersistedContent>;
  if (
    !Array.isArray(typedContent.periods) ||
    !Array.isArray(typedContent.objectives) ||
    !Array.isArray(typedContent.keyResults) ||
    !Array.isArray(typedContent.checkIns)
  ) {
    return null;
  }

  return {
    ventures: venturesData as Venture[],
    content: {
      ragThresholds: typedContent.ragThresholds,
      periods: typedContent.periods as Period[],
      objectives: typedContent.objectives as Objective[],
      keyResults: typedContent.keyResults as KeyResult[],
      checkIns: typedContent.checkIns as CheckIn[]
    }
  };
}

export async function ensureSharePointStore(): Promise<{
  enabled: boolean;
  reason: string;
  siteUrl: string;
  listName: string;
}> {
  const config = getStorageConfig();
  if (!config.enabled) {
    return {
      enabled: false,
      reason: config.reason,
      siteUrl: config.siteUrl,
      listName: config.listName
    };
  }

  await ensureAtomicTargets(config);
  return {
    enabled: true,
    reason: "",
    siteUrl: config.siteUrl,
    listName: config.listName
  };
}

export async function loadSharePointSnapshot(): Promise<SharePointStoreSnapshot | null> {
  const config = getStorageConfig();
  if (!config.enabled) {
    return null;
  }

  const atomic = await loadAtomicSnapshot(config);
  if (atomic) {
    return atomic;
  }

  const legacy = await loadLegacySnapshot(config);
  if (!legacy) {
    return null;
  }

  await saveAtomicSnapshot(config, legacy);
  return legacy;
}

export async function saveSharePointSnapshot(snapshot: SharePointStoreSnapshot): Promise<void> {
  const config = getStorageConfig();
  if (!config.enabled) {
    return;
  }

  await saveAtomicSnapshot(config, snapshot);
}
