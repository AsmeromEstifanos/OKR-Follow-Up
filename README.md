# OKR Follow-Up

Internal OKR follow-up app built with Next.js and SharePoint list-backed persistence.

## User Documentation

- Detailed user manual: [`USER_MANUAL.md`](./USER_MANUAL.md)
- Auth flow diagram: [`AUTH_FLOW.md`](./AUTH_FLOW.md)

## What is implemented

- Dashboard with venture tabs and position cards
- Venture management: add, rename, delete
- Position management per venture: add, rename, delete
- Objective management per position:
  - Add with optional manual objective code
  - In-place edit for all visible objective fields
  - Delete with confirmation
- Key Result management per objective:
  - Expand/collapse Key Results section
  - Add with optional manual KR code
  - In-place edit for all visible KR fields
  - Delete with confirmation
- Wide-table support with horizontal scrolling
- API routes for periods, objectives, KRs, check-ins, dashboard, and configuration

## Local run

1. Install dependencies:

```bash
npm install
```

2. Start dev server:

```bash
npm run dev
```

3. Open:

```text
http://localhost:3000
```

4. Optional configuration page:

```text
http://localhost:3000/config
```

## Data source and persistence

- Core business logic lives in [`lib/dummy-store.ts`](./lib/dummy-store.ts)
- Runtime persistence is SharePoint-only via [`lib/sharepoint/server-storage.ts`](./lib/sharepoint/server-storage.ts)
- If SharePoint server credentials are missing, API operations fail with a SharePoint configuration error.

## SharePoint list storage (enabled mode)

When these env vars are provided, the app hydrates data from SharePoint and syncs all CRUD changes back to SharePoint:

- `AZURE_APP_TENANT_ID`
- `AZURE_APP_CLIENT_ID`
- `AZURE_APP_CLIENT_SECRET`
- `SHAREPOINT_SITE_URL`
- `SHAREPOINT_STORAGE_LIST` (optional, default: `OKR Follow Up Store`)

Data is stored in atomic SharePoint lists (list names use `SHAREPOINT_STORAGE_LIST` as a prefix):

- `<prefix> Ventures`
- `<prefix> Departments`
- `<prefix> Periods`
- `<prefix> Objectives`
- `<prefix> Key Results`
- `<prefix> Check-Ins`
- `<prefix> Config`

On first run (if records do not exist), default seed data is written to these lists.
If legacy snapshot records (`Title = ventures` / `Title = content`) are found in `<prefix>`, they are migrated automatically.

## API surface

- `GET/POST /api/periods`
- `PATCH /api/periods/:periodKey`
- `GET/POST /api/objectives`
- `GET/PATCH/DELETE /api/objectives/:objectiveKey`
- `GET/POST /api/krs`
- `GET/PATCH/DELETE /api/krs/:krKey`
- `GET/POST /api/checkins`
- `GET /api/dashboard/me`
- `GET /api/config`
- `PATCH /api/config/rag`
- `GET/POST /api/config/ventures`
- `PATCH/DELETE /api/config/ventures/:ventureKey`
- `POST /api/config/ventures/:ventureKey/departments`
- `PATCH/DELETE /api/config/ventures/:ventureKey/departments/:departmentKey`

## Business rules

- KR progress is computed and clamped to `0..100`
- Objective progress is the average of child KR progress values
- Missing check-in logic uses a 7-day threshold for active periods
- Objective RAG derives from configurable thresholds

## SharePoint setup API

- `GET /api/sharepoint/setup`: returns SharePoint storage config status
- `POST /api/sharepoint/setup`: ensures the target list exists and seeds initial data when needed
