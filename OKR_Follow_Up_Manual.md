# OKR Follow-Up — Application Manual

**Version 0.5.36 · Last updated 2026-05-20**

This document is a complete reference for the OKR Follow-Up application: what every feature does, how it works internally, and what you need to reproduce any part of it in a new application. It is written for developers and power users alike.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Technology Stack](#2-technology-stack)
3. [Architecture](#3-architecture)
4. [Authentication & Authorization](#4-authentication--authorization)
5. [Data Model](#5-data-model)
6. [OKR Board (Main View)](#6-okr-board-main-view)
7. [Dashboard](#7-dashboard)
8. [Activity Log](#8-activity-log)
9. [Chat & Comment Threads](#9-chat--comment-threads)
10. [AI Assistant](#10-ai-assistant)
11. [Notification & Reminder System](#11-notification--reminder-system)
12. [Configuration Panel](#12-configuration-panel)
13. [API Reference](#13-api-reference)
14. [Data Layer: SharePoint + In-Memory Store](#14-data-layer-sharepoint--in-memory-store)
15. [Deployment](#15-deployment)
16. [Environment Variables](#16-environment-variables)
17. [Reproducing Features in Another App](#17-reproducing-features-in-another-app)

---

## 1. Overview

OKR Follow-Up is a web application for tracking Objectives and Key Results (OKRs) across an organisation. It is built for teams that use Microsoft 365: identity comes from Azure Active Directory, data is stored in SharePoint Lists, and reminder emails are sent via Microsoft Graph.

**Core capabilities:**

| Capability | Description |
|---|---|
| OKR Board | Create and manage objectives, key results, milestones, and check-ins |
| Dashboard | Aggregated progress view with RAG scoring |
| Activity Log | Audit trail of every change with field-level diffs |
| Chat threads | Per-objective and per-KR discussion threads with @mention notifications |
| AI Assistant | OpenAI-powered chat with live OKR data as context |
| Scheduled reminders | Five configurable email reminder rules sent automatically or on demand |
| Role-based access | Admin / Manager / Editor / Viewer roles controlling what each user can do |

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5.x |
| Auth (browser) | Azure AD via MSAL (`@azure/msal-browser`, `@azure/msal-react`) |
| Auth (server) | Azure AD app credentials (client ID + secret) |
| Backend data | SharePoint Lists via Microsoft Graph API |
| Email | Microsoft Graph `sendMail` API |
| AI | OpenAI API (`gpt-4o-mini`) |
| Deployment | cPanel (Node.js Passenger), GitHub Actions CI/CD |
| CSS | Plain CSS with CSS custom properties (no framework) |

---

## 3. Architecture

```
Browser (React / MSAL)
        │
        │  HTTP (x-user-email header carries identity)
        ▼
Next.js API Routes  (app/api/**)
        │
        ├── lib/store.ts          ← public facade, used by all routes
        │       │
        │       ├── lib/dummy-store.ts   ← in-memory store, all business logic
        │       │
        │       └── lib/sharepoint/server-storage.ts  ← SharePoint adapter
        │
        ├── lib/notification-rules.ts   ← rule definitions + schedule matching
        ├── lib/run-reminders.ts         ← reminder build + send logic
        ├── lib/notifications.ts         ← email HTML builder + Graph send
        └── lib/auth/msal-server.ts      ← server-side MSAL token acquisition
```

### Request lifecycle

1. The browser sends a request with `x-user-email: user@org.com` in the header (populated from the MSAL account object on the client).
2. The API route reads that header and passes it to a guard function (`requireAdmin`, `requireOwnerOrManagerForUpdate`, etc.).
3. The guard calls `getUserRole(email)` from the store to check authorization.
4. If authorized, the route calls store functions (which hydrate from SharePoint on first call in the request lifecycle, then serve from memory).
5. Mutations write to the in-memory store first, then sync atomically to SharePoint.
6. Long-running mutations use `withOperationProgress` to stream progress to the client via a separate polling endpoint.
7. After a successful mutation, `logSuccessfulRequestActivity` records the change in the Activity Log SharePoint list.

### URL base path

The app can be deployed under a sub-path (e.g., `/okr`) by setting `NEXT_PUBLIC_BASE_PATH`. The helpers `withBasePath()` and `apiPath()` from `lib/base-path.ts` must be used everywhere a URL is constructed. Never hardcode `/` directly.

---

## 4. Authentication & Authorization

### 4.1 Browser authentication (delegated)

- Uses MSAL `PublicClientApplication` (configured in `lib/auth/msal-client.ts`).
- On first load, MSAL checks for an existing session. If none exists, the user sees the sign-in button.
- After sign-in, MSAL stores the account in `localStorage`. The `activeAccount.username` (or `idTokenClaims.preferred_username`) is the user's email.
- The email is passed down via the `x-user-email` HTTP header on every API call.

### 4.2 Server authentication (application credentials)

- All API routes that call SharePoint or send Graph emails use **application credentials** (client ID + client secret), not the signed-in user's token.
- This means the app needs the SharePoint site and mail-send permissions granted at the application level in Azure AD.
- Token acquisition is in `lib/auth/msal-server.ts` using the client-credentials flow.

### 4.3 Role system

Four roles are defined, stored in a SharePoint list called `<prefix>_RoleAssignments`:

| Role | Level | Can do |
|---|---|---|
| **Admin** | 40 | Everything: CRUD on all items, config, roles, send reminders |
| **Manager** | 30 | Read all items, create any objective/KR, view Activity Log |
| **Editor** | 20 | Create/update only objectives and KRs where they are listed as `ownerEmail` |
| **Viewer** | 10 | Read only — cannot create or update anything |

A **default role** can be configured for users not individually listed. This is stored as a special `__default__` email key in the same SharePoint list.

#### How role checks work

Every protected route calls a guard function from `app/api/_utils/`:

- `requireAdmin(request)` — used for config mutations, role management, reminder sending.
- `requireDepartmentOwnerOrAdminForObjectiveCreate(request, payload)` — used on `POST /api/objectives`. Passes for Admin, Manager, department owner, and Editor if they are the `ownerEmail`.
- `requireDepartmentOwnerOrAdminForKrCreate(request, payload)` — same but for `POST /api/krs`.
- `requireOwnerOrManagerForUpdate(request, itemOwnerEmail)` — used on `PATCH /api/objectives/[key]` and `PATCH /api/krs/[key]`. Editors can only update items they own.

Each guard calls `resolveEffectiveRole(email)` which returns the role string (or null), then applies the appropriate logic.

#### Role resolution order

```
1. Look up email in RoleAssignments list  →  if found, use that role
2. Look up __default__ in RoleAssignments →  if found, use that role
3. Return null (no access)
```

---

## 5. Data Model

### 5.1 SharePoint Lists

The application uses 11 SharePoint lists. All list names are prefixed by the `SHAREPOINT_STORAGE_LIST` environment variable (e.g., `OKR_Objectives`, `OKR_KeyResults`).

| List suffix | Purpose |
|---|---|
| `_Ventures` | Top-level org units containing departments |
| `_Periods` | OKR periods (quarters/years) with status |
| `_Objectives` | OKR objectives |
| `_KeyResults` | Key results belonging to objectives |
| `_Milestones` | Milestones belonging to key results |
| `_CheckIns` | Progress check-in entries |
| `_Config` | App configuration (RAG thresholds, field options) |
| `_Comments` | Discussion thread messages |
| `_RoleAssignments` | User role assignments |
| `_AuthLog` | Sign-in audit log |
| `_ActivityLog` | Mutation audit log |

### 5.2 Core types

#### Venture
```typescript
{
  ventureKey: string          // unique slug, e.g. "SALES"
  ventureName: string
  departments: Department[]
}

Department {
  departmentKey: string       // e.g. "SALES-OPERATIONS"
  departmentName: string
  ventureName: string
}
```

#### Period
```typescript
{
  periodKey: string           // e.g. "Q1-2026"
  name: string
  startDate: string           // ISO date
  endDate: string             // ISO date
  status: "Active" | "Closed" | "Planned"
  okrCycle: "Q1" | "Q2" | "Q3" | "Q4" | "Annual"
}
```

#### Objective
```typescript
{
  objectiveKey: string        // e.g. "OBJ-SALES-001"
  objectiveCode: string       // e.g. "OBJ-001"
  title: string
  description?: string
  periodKey: string
  ventureName: string
  department: string
  owner: string               // display name
  ownerEmail: string
  objectiveType: string       // from field options
  strategicTheme?: string
  status: string
  rag: "Red" | "Amber" | "Green"
  progressPct: number         // 0–100, computed from child KRs
  okrCycle: string
  missesCheckin: boolean      // true if > 7 days without check-in during Active period
}
```

#### KeyResult
```typescript
{
  krKey: string               // e.g. "KR-SALES-001-001"
  krCode: string              // e.g. "KR-001"
  title: string
  objectiveKey: string
  periodKey: string
  owner: string
  ownerEmail: string
  metricType: string          // Delivery / Financial / Operational / People / Quality
  baselineValue: number | null
  targetValue: number | null
  currentValue: number | null
  progressPct: number         // computed
  status: string
  checkInFrequency: string    // Weekly / BiWeekly / Monthly / AdHoc
  krType: "measurable" | "non-measurable"
}
```

**KR Types:**
- **Measurable**: has `baselineValue`, `targetValue`, `currentValue`. Progress = `((current − baseline) / (target − baseline)) × 100`, clamped 0–100.
- **Non-measurable**: `targetValue` and `currentValue` are null. Progress is 0% or 100% (Done / Not Done), toggled directly.

#### Milestone
```typescript
{
  milestoneKey: string
  title: string
  krKey: string
  objectiveKey: string
  periodKey: string
  dueDate?: string
  progressPct: number         // 0 or 100
  status: "Pending" | "Complete" | "Blocked"
  weight: number              // contribution weight (default 1)
}
```

#### CheckIn
```typescript
{
  checkInKey: string
  objectiveKey?: string
  krKey?: string
  periodKey: string
  owner: string
  ownerEmail: string
  notes: string
  progressPct?: number
  createdAt: string
}
```

#### Comment
```typescript
{
  commentKey: string
  entityType: "objective" | "kr"
  entityKey: string
  body: string                // may contain @[Display Name] tokens
  authorEmail: string
  authorName: string
  createdAt: string
}
```

### 5.3 Progress calculation rules

| Item | Formula |
|---|---|
| Measurable KR | `((current − baseline) / (target − baseline)) × 100`, clamped 0–100 |
| Non-measurable KR | 0 or 100 (Done / Not Done toggle) |
| Objective | Weighted average of all child KR `progressPct` values |
| Milestone | 0 or 100 (Complete or not) |

**RAG thresholds** are configurable per organisation in the Config panel. Defaults:
- Green: progress ≥ 70%
- Amber: progress ≥ 40%
- Red: progress < 40%

**Missing check-in** is flagged when:
- The period is Active
- More than 7 days have elapsed since the last check-in for that objective/KR

---

## 6. OKR Board (Main View)

**Route:** `/` (the root page)

The board is the primary working view. It lists all objectives in a table and allows inline editing of key results.

### 6.1 Filtering

The toolbar offers filters that are preserved in the URL as query parameters:
- `ventureKey` — limits the view to a single venture
- `department` — limits to a single department
- `periodKey` — limits to a period
- `owner` — limits to items owned by a specific user
- `status` — filters by status

The `ventureKey` and `department` params are also preserved when navigating between Board, Dashboard, Config, etc., via the `navQuery` computed in `app/app-shell.tsx`.

### 6.2 Objective rows

Each objective row shows:
- Code (e.g., OBJ-001), title, department, owner
- Progress % bar
- RAG badge (Red / Amber / Green)
- Status
- Missing check-in warning
- Count of child KRs and milestones
- Chat bubble button (opens the comment thread)
- Expand button to show child KRs inline

### 6.3 Key Result rows (inline)

Expanding an objective shows its KRs as sub-rows. Each KR row shows:
- Code (e.g., KR-001), title, owner
- For measurable KRs: Baseline / Target / Current inputs, progress %
- For non-measurable KRs: Done / Not Done toggle
- An inline edit mode activated by clicking the row

### 6.4 Creating objectives

Clicking "Add Objective" opens a form with:
- Title, description
- Department (dropdown from config)
- Venture, Strategic Theme, OKR Cycle
- Owner name + email
- Status, Objective Type

On submit, `POST /api/objectives` is called. The response goes through `withOperationProgress` — the client polls `GET /api/operation-progress/[id]` to show progress.

**Authorization check on create:**
- Admin or Manager: always allowed
- Editor: allowed only if their email matches the `ownerEmail` field being set
- Viewer: blocked (403)

### 6.5 Creating key results

The "Add KR" button beneath each objective opens a row editor with:
- Title
- KR Type: Measurable or Non-measurable
- Owner name + email (auto-fills from parent objective's owner)
- For Measurable: Baseline, Target, Current inputs
- Metric Type, Status, Check-in Frequency

On submit, `POST /api/krs` is called with the same operation progress pattern.

### 6.6 Inline editing

Clicking an existing KR row switches it to edit mode. Changes are saved via `PATCH /api/krs/[krKey]`. The edit guard (`requireOwnerOrManagerForUpdate`) ensures Editors can only save their own KRs.

### 6.7 Code generation

Objective and KR codes are auto-generated:
- Objective codes are scoped to venture + department + strategic theme. The first objective in a scope gets "OBJ-001", the next gets "OBJ-002", etc.
- KR codes are scoped to their parent objective: "KR-001", "KR-002", etc.
- The client calls `GET /api/codes/objective` and `GET /api/codes/kr` to preview the next code before saving.

---

## 7. Dashboard

**Route:** `/dashboard`

### 7.1 Overview

The dashboard shows an aggregated view of all objectives, grouped by venture and department. It is designed for managers who want to see the state of everything at a glance.

**Data source:** `GET /api/dashboard/me` — returns a `DashboardMe` object with:
- RAG counts (Red / Amber / Green)
- Progress averages
- Per-objective breakdown

### 7.2 Three views

| View | How to access | What it shows |
|---|---|---|
| **Overview** | Default | All objectives grouped by venture/department |
| **Department** | Click a department card | Single department with KR detail |
| **Objective** | Click an objective | Single objective with all KRs and milestones |

### 7.3 Filters

The dashboard respects the same `ventureKey` and `department` query params as the board.

---

## 8. Activity Log

**Route:** `/activity`

**Access:** Manager and Admin roles only (enforced both client-side in the nav link and server-side in `GET /api/activity`).

### 8.1 What is logged

Every successful mutation (POST, PATCH, DELETE) through the API is logged. The log captures:
- Who performed the action (from `x-user-email` header)
- What they did (HTTP method + route path → human-readable sentence)
- What changed (field-level before/after diff stored as JSON)
- When it happened
- What entity was affected (type + key + label)

### 8.2 How logging works

1. Mutation routes are wrapped in `withOperationProgress()` (`app/api/_utils/with-operation-progress.ts`).
2. Before calling the store, the route sets `x-activity-label` and `x-activity-details` response headers with the entity's display name and the diff JSON.
3. `withOperationProgress` calls `logSuccessfulRequestActivity` after the mutation succeeds.
4. `logSuccessfulRequestActivity` reads those headers, infers entity type and key from the URL path, and calls `logUserActivity()` in the store.
5. The store writes an entry to the `_ActivityLog` SharePoint list.

### 8.3 Field diff capture

The `buildActivityDiff(before, after)` function in `app/api/_utils/user-activity-log.ts` compares two plain objects field-by-field and returns a JSON array of `{field, from, to}` objects for every changed field. This is stored in `detailsJson` on the activity log entry.

### 8.4 Filters

The Activity Log page provides:
- **Period presets**: Today, This Week, This Month, This Quarter, This Year
- **Custom date range**: From / To date pickers
- **Entity type**: Filter to objectives, key results, milestones, check-ins, comments, or reminders
- **User email**: Filter to actions by a specific user

### 8.5 Display

- Entries are grouped by calendar day.
- Each entry shows: user, action sentence ("Updated key result KR-001 · Title"), timestamp.
- Clicking an entry opens a popup. For `objectives` and `krs` entries the popup fetches the live item from `GET /api/objectives` / `GET /api/krs`, matches it by `entityKey` (falling back to the code parsed from `entityLabel`), and renders all of the item's current fields in a defined order. For other entity types it falls back to showing the recorded field-change diff. If the item is no longer present it shows a "no longer exists" message.
- A "Load more" button fetches the next page (cursor-based pagination using the ISO timestamp of the last entry).

### 8.6 Insights panel

Alongside the feed, the Activity page shows:
- Total events in the selected period
- Daily volume bar chart
- Entity type breakdown
- Top users (most active)
- Most-changed items

---

## 9. Chat & Comment Threads

### 9.1 Per-entity threads

Every objective and every key result has its own discussion thread. The thread is opened by clicking the chat bubble icon on a row.

Threads are stored in the `_Comments` SharePoint list. Each comment has:
- `entityType`: "objective" or "kr"
- `entityKey`: the key of the entity
- `body`: the message text
- `authorEmail`, `authorName`
- `createdAt`

### 9.2 @mention support

Typing `@` in the message box opens a live dropdown of Azure AD users (fetched from `GET /api/users/suggest?search=`). Selecting a user inserts `@[Display Name]` as a token in the message.

On submit, the client:
1. Scans the message body for `@[Name]` tokens.
2. Resolves each token to an email via `GET /api/users/suggest`.
3. Sends the message to `POST /api/comments` with a `mentionedEmails` array.

The server sends a mention email to each listed address via `sendMentionNotifications()`, which uses the Graph `sendMail` API.

**Tokens in stored messages** appear as `@[Display Name]` and are rendered with a teal highlight in the chat UI.

### 9.3 Notification bell

The notification bell in the sidebar header (`app/notification-bell.tsx`) shows a count of unread threads. It works by:
1. Fetching all comment counts from `GET /api/comments/counts`.
2. Comparing the `timestamps` array of each thread against the `localStorage` last-read timestamp keyed by `okr-chat-last-read::<entityType>::<entityKey>::<email>`.
3. Any message posted after the last-read time is counted as unread.
4. The last-read time is updated when the user closes the chat modal.

The bell dropdown lists all threads sorted by unread-first, showing the last message preview and a relative time.

### 9.4 Unread state

- `localStorage` key format: `okr-chat-last-read::objective::OBJ-001::user@org.com`
- The value is the ISO timestamp of the newest message the user has seen.
- A custom DOM event `okr-chat-last-read-updated` is dispatched when the value changes, so the bell recomputes without a page reload.

---

## 10. AI Assistant

The AI assistant is a floating chat panel (`app/ai-global-chat.tsx`) available to authenticated users on every page.

### 10.1 How it works

1. The user types a question in the floating panel.
2. The client calls `POST /api/ai/chat` with the conversation history.
3. The server:
   a. Loads live OKR data from the store (periods, objectives, KRs, milestones, check-ins).
   b. Builds a system prompt describing the organisation's OKR state.
   c. Sends the conversation + system prompt to OpenAI `gpt-4o-mini`.
   d. Streams the response back to the client as `text/plain`.
4. The client renders the streamed response token-by-token.

### 10.2 Context caching

OKR data is fetched once and cached for 10 minutes per server instance to avoid hammering SharePoint on every message.

### 10.3 Summarise

`POST /api/ai/summarize` works similarly but returns a one-shot summary of a specific objective or KR, used by the "AI Summary" button on entity detail pages.

### 10.4 Requirements

`OPENAI_API_KEY` must be set. If absent, the AI features are hidden.

---

## 11. Notification & Reminder System

### 11.1 Overview

The reminder system sends aggregated email summaries to OKR owners. Each owner receives a single email containing all applicable reminder sections, not one email per rule.

### 11.2 The five reminder rules

| ID | Label | Default schedule | What it includes |
|---|---|---|---|
| `weeklyDigest` | Weekly OKR Digest | Every Monday, 8:30 AM | All owner objectives: RAG + progress % |
| `endOfWeekReflection` | End-of-Week Reflection | Every Friday, 3:30 PM | Objectives RAG + all KR progress % |
| `midMonthCheckpoint` | Mid-Month Checkpoint | 15th of month, 10:00 AM | Red and Amber objectives only + their KRs |
| `thirdWeekFocus` | Third-Week Focus | 22nd of month, 9:00 AM | Objectives with progress < 60% or Red/Amber |
| `monthEndReadiness` | Month-End Readiness | Last working day, 11:00 AM | All objectives + all KRs (full snapshot) |

### 11.3 Schedule matching

All schedule times are evaluated in the **operations timezone** (default: Africa/Addis_Ababa, GMT+3). Override with `NOTIFICATION_TIMEZONE_OFFSET` env var.

The automatic scheduler (`POST /api/notifications/scheduled`) is called by an external cron job (e.g., every 15 minutes). It calls `rulesFiringAt(now, 15)` which checks whether any enabled rule's scheduled time falls within the 15-minute window before the current time. Only matching rules fire.

This means:
- **The automatic scheduler is schedule-aware**: it only sends rules that match the current time. Setting a rule to "Monday 8:30 AM" means it fires once, in the first 15-minute cron run after 8:30 AM on Mondays.
- **The manual send bypasses schedule matching**: admins choose exactly which rules to send and to whom.

### 11.4 Email construction

`lib/notifications.ts` builds the HTML email. One email per owner contains one section per rule. Each section shows:
- The rule label and message
- A table of the owner's objectives with progress %, RAG colour, and status
- (For rules that include KRs) A sub-table of KRs under each objective

Emails are sent via the Microsoft Graph `sendMail` API using the `NOTIFICATION_FROM_EMAIL` address.

### 11.5 Manual send flow (Admin UI)

The "Send Reminders Now" button in Config > Notifications opens a 3-step dialog:

**Step 1 — Choose rules**
- Lists all enabled reminder rules with their labels and schedule descriptions.
- Admin selects a subset (checkboxes).
- Click "Next: choose recipients".

**Step 2 — Choose recipients**
- Shows all owners who would receive an email for the selected rules.
- "Toggle all" / individual checkboxes.
- "Preview" button opens an iframe showing the exact HTML email each recipient would receive.
- Recipient switcher to browse previews.
- Click "Send to X recipients".

**Step 3 — Result**
- Shows how many emails were sent, any errors.
- Logs the run to the Activity Log.

### 11.6 Reminder log

The Config > Notifications tab also shows a log of past reminder runs (both manual and scheduled), including:
- When it ran
- Who triggered it (admin email or "scheduler")
- How many emails were sent
- Any errors
- Expandable list of recipients and subjects

### 11.7 Admin customisation

In Config > Notifications, admins can per-rule:
- Enable / disable the rule
- Change the schedule (day of week, day of month, time)
- Edit the email intro message

Changes are stored in `notification-settings.json` on the server filesystem (in the `data/` directory, which is preserved across deployments).

---

## 12. Configuration Panel

**Route:** `/config`

**Access:** Admin role only.

The config panel has six tabs.

### 12.1 Admins tab (legacy)

Lists email addresses with Admin access. This is a legacy mechanism predating the full role system. Adding an email here grants admin access in addition to the Roles system.

### 12.2 Roles tab

Manage role assignments for individual users:
- List all role assignments sorted by role hierarchy (Admin → Manager → Editor → Viewer)
- Assign a role to a new email address
- Remove a role assignment
- Set the **default role** for users not individually listed (dropdown: Admin / Manager / Editor / Viewer / None)

### 12.3 Field Options tab

Manage the dropdown lists used throughout the application:
- Objective Types (e.g., Strategic, Operational)
- Objective Statuses
- OKR Cycles
- KR Metric Types (Delivery, Financial, Operational, People, Quality)
- KR Statuses
- Check-In Frequencies (Weekly, BiWeekly, Monthly, AdHoc)

### 12.4 RAG tab

Configure the RAG thresholds:
- **Green minimum**: progress % at which an objective becomes Green (default 70)
- **Amber minimum**: progress % at which it becomes Amber (default 40)
- Below Amber minimum = Red

### 12.5 Ventures tab

Manage the organisational structure:
- Create, rename, delete ventures
- Create, rename, delete departments within ventures
- Departments are the unit that objectives belong to

### 12.6 Notifications tab

- Enable/disable each of the 5 reminder rules
- Customise schedule (time, day) per rule
- Edit the email intro message per rule
- Send reminders manually (opens the 3-step dialog described above)
- View the reminder run log

---

## 12.7 In-app Help page

**Route:** `/help` · **Access:** all signed-in users.

The Help page (`app/help/page.tsx`) renders an end-user guide that mirrors `OKR_Follow_Up_User_Guide.md`. Content lives as structured data in `app/help/help-content.ts` (an array of `{ id, title, category, body }` sections) — no markdown parser or file fetch is needed, so it works in the static build.

Features:
- Free-text search that matches across every section's title, category, and body (all search terms must match).
- Category filter chips (Getting started, Working with goals, Collaboration, Reminders & AI, For managers & admins, Help).
- A sticky table of contents that jumps to a section (smooth scroll).

**Keeping content in sync:** When a user-facing feature changes, update both `help-content.ts` (in-app) and `OKR_Follow_Up_User_Guide.md` (repo doc). They are intentionally duplicated so the app has no build-time dependency on the markdown file.

---

## 13. API Reference

All routes require `x-user-email` header for authorization. All routes export `dynamic = "force-dynamic"` to disable Next.js caching.

### Objectives

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/objectives` | Public | List objectives (filters: `periodKey`, `department`, `owner`, `status`) |
| POST | `/api/objectives` | Department owner / Manager / Admin | Create objective |
| GET | `/api/objectives/[objectiveKey]` | Public | Get single objective with child KRs |
| PATCH | `/api/objectives/[objectiveKey]` | Owner / Manager / Admin | Update objective |
| DELETE | `/api/objectives/[objectiveKey]` | Admin | Delete objective (cascades to KRs, check-ins) |

### Key Results

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/krs` | Public | List KRs (filters: `periodKey`, `objectiveKey`, `owner`, `status`) |
| POST | `/api/krs` | Department owner / Manager / Admin | Create KR |
| GET | `/api/krs/[krKey]` | Public | Get single KR |
| PATCH | `/api/krs/[krKey]` | Owner / Manager / Admin | Update KR |
| DELETE | `/api/krs/[krKey]` | Admin | Delete KR (cascades to check-ins) |

### Milestones & Check-Ins

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/milestones` | Public | List milestones |
| POST | `/api/milestones` | Authenticated | Create milestone |
| PATCH | `/api/milestones/[milestoneKey]` | Owner / Manager / Admin | Update milestone |
| DELETE | `/api/milestones/[milestoneKey]` | Admin | Delete milestone |
| GET | `/api/checkins` | Public | List check-ins |
| POST | `/api/checkins` | Authenticated | Create check-in |

### Comments

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/comments` | Public | Get comments for entity (`entityType`, `entityKey` required) |
| POST | `/api/comments` | Authenticated | Create comment; sends mention emails if `mentionedEmails` provided |
| DELETE | `/api/comments/[commentKey]` | Authenticated | Delete comment |
| GET | `/api/comments/counts` | Public | Get enriched comment counts per entity |

### Roles & Authorization

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/authz/me` | Authenticated | Returns `{ email, isAdmin, role }` for caller |
| GET | `/api/roles` | Admin | List all role assignments |
| POST | `/api/roles` | Admin | Assign role: `{ email, role, displayName? }` |
| DELETE | `/api/roles/[email]` | Admin | Remove role assignment |
| GET | `/api/roles/default` | Admin | Get default role |
| PUT | `/api/roles/default` | Admin | Set default role: `{ defaultRole: "Admin"\|"Manager"\|"Editor"\|"Viewer"\|null }` |

### Notifications

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/notifications/remind` | Admin | Preview: who would receive which rules; `?ruleIds=` to scope |
| POST | `/api/notifications/remind` | Admin | Send: `{ ruleIds?: string[], recipients?: string[] }` |
| POST | `/api/notifications/scheduled` | Scheduler secret | Auto-send: fires rules matching current time |
| GET | `/api/notifications/settings` | Admin | Get notification settings |
| POST | `/api/notifications/settings` | Admin | Update notification settings |
| GET | `/api/notifications/log` | Admin | Get reminder run log |

### Activity Log

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/activity` | Manager / Admin | Paginated log; query params: `period`, `from`, `to`, `entityType`, `userEmail`, `limit`, `cursor` |

### Configuration

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/config` | Public | Get full app config |
| GET | `/api/config/ventures` | Public | List ventures |
| POST | `/api/config/ventures` | Admin | Create venture |
| PATCH | `/api/config/ventures/[key]` | Admin | Update venture |
| DELETE | `/api/config/ventures/[key]` | Admin | Delete venture |
| POST | `/api/config/ventures/[key]/departments` | Admin | Add department |
| PATCH | `/api/config/ventures/[key]/departments/[dKey]` | Admin | Update department |
| DELETE | `/api/config/ventures/[key]/departments/[dKey]` | Admin | Delete department |
| PATCH | `/api/config/rag` | Admin | Update RAG thresholds |
| POST | `/api/config/field-options` | Admin | Update field options |

### Utility

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/codes/objective` | Public | Preview next objective code |
| GET | `/api/codes/kr` | Public | Preview next KR code |
| GET | `/api/users/suggest` | Authenticated | Azure AD user autocomplete |
| GET | `/api/sharepoint/setup` | Admin | Initialize SharePoint list structure |
| GET | `/api/operation-progress/[id]` | Public | Poll operation progress (SSE stream) |
| POST | `/api/ai/chat` | Authenticated | Stream AI chat response |
| POST | `/api/ai/summarize` | Authenticated | Generate AI summary |
| POST | `/api/auth/logins` | Authenticated | Log sign-in event |

---

## 14. Data Layer: SharePoint + In-Memory Store

### 14.1 Three-tier design

```
API Route
    │
    ▼
lib/store.ts                 ← Public facade. Import from here only.
    │
    ├── lib/dummy-store.ts   ← In-memory store. All business logic lives here.
    │
    └── lib/sharepoint/
        server-storage.ts    ← SharePoint adapter. Translates types ↔ SP columns.
```

**Why this design:** SharePoint is slow (100–500ms per list query). The in-memory store absorbs that cost on first hydration, then serves subsequent calls in the same request from memory. Mutations write to memory immediately and then sync to SharePoint.

### 14.2 Hydration

On the first API call of a request, `ensureStoreHydrated()` in `store.ts` calls `server-storage.ts` to fetch all data from SharePoint and populate the in-memory store in `dummy-store.ts`. Subsequent calls within the same request (same Node.js module cache lifetime) reuse the in-memory data.

### 14.3 Sync

Every mutation function in `dummy-store.ts` ends by calling `syncObjectToSharePoint()` or `syncArrayToSharePoint()` (via the store facade) which writes the changed item(s) back to the appropriate SharePoint list.

### 14.4 SharePoint column mapping

`server-storage.ts` maps between TypeScript field names and SharePoint column names. For example:
- `objectiveKey` ↔ `Title` (SharePoint's built-in title column)
- `ownerEmail` ↔ `OwnerEmail`
- `progressPct` ↔ `ProgressPct`

All values written to SharePoint list item headers must be ASCII (≤ char code 255). The app strips non-ASCII characters before writing to response headers using `rawLabel.replace(/[^\x00-\x7F]/g, "")`.

### 14.5 Operation progress

Long-running mutations (creates, updates) use `withOperationProgress`:
1. A UUID operation ID is generated.
2. The mutation runs asynchronously.
3. The client polls `GET /api/operation-progress/[id]` which returns a Server-Sent Events (SSE) stream of progress percentages.
4. The client shows a progress bar while polling.
5. When the mutation completes, the SSE stream closes with the final result.

---

## 15. Deployment

### 15.1 CI/CD pipeline

`.github/workflows/deploy-cpanel.yml`:
1. On push to `main`: runs `npm run typecheck` and `npm run build`.
2. Tarballs: `.next/`, `app/`, `lib/`, `public/`, config files (`package.json`, `next.config.mjs`, etc.).
3. SCPs the tarball to the cPanel server.
4. On the server: extracts, runs `npm ci --omit=dev`, touches `tmp/restart.txt` (Passenger restarts).
5. Server secrets are written from GitHub Actions secrets into `.env.deploy` at deploy time.
6. The `data/` directory (contains `notification-settings.json`) and `.env` are **preserved across deploys**.

### 15.2 Sub-path deployment

If the app is deployed under `/okr`:
- Set `NEXT_PUBLIC_BASE_PATH=/okr` in environment.
- Next.js handles all asset and routing prefixing automatically.
- All in-app URL construction must use `withBasePath()` / `apiPath()` from `lib/base-path.ts`.

### 15.3 Local development

```bash
npm run dev          # starts Next.js dev server on port 3000
npm run build        # production build
npm run typecheck    # TypeScript checks (no test suite)
npm run lint         # ESLint
```

---

## 16. Environment Variables

| Variable | Where used | Required |
|---|---|---|
| `NEXT_PUBLIC_BASE_PATH` | URL prefix for sub-path deploy | No |
| `NEXT_PUBLIC_AZURE_CLIENT_ID` | MSAL browser auth client ID | Yes |
| `NEXT_PUBLIC_AAD_TENANT_ID` | MSAL browser auth tenant ID | Yes |
| `NEXT_PUBLIC_REDIRECT_URI` | MSAL post-login redirect | Yes |
| `NEXT_PUBLIC_SHAREPOINT_SITE_URL` | Client-side site probe URL | Yes |
| `NEXT_PUBLIC_SHAREPOINT_STORAGE_LIST` | SharePoint list name prefix (client) | Yes |
| `AZURE_APP_TENANT_ID` | Server-side Graph auth tenant ID | Yes |
| `AZURE_APP_CLIENT_ID` | Server-side Graph auth client ID | Yes |
| `AZURE_APP_CLIENT_SECRET` | Server-side Graph auth secret | Yes |
| `SHAREPOINT_SITE_URL` | Server-side SharePoint site URL | Yes |
| `SHAREPOINT_STORAGE_LIST` | SharePoint list name prefix (server) | Yes |
| `OPENAI_API_KEY` | AI chat/summarize feature | Optional |
| `NOTIFICATION_FROM_EMAIL` | Sender address for reminder emails | Optional |
| `NOTIFICATION_TIMEZONE_OFFSET` | Hours offset from UTC for schedule matching (default: 3) | Optional |
| `SCHEDULER_SECRET` | Bearer token for the scheduled endpoint | Optional |

---

## 17. Reproducing Features in Another App

This section explains what you need to reproduce each major feature independently, stripped of the SharePoint/MSAL specifics.

### 17.1 OKR data model (any backend)

**What you need:**

- Six entity tables: Ventures, Periods, Objectives, KeyResults, Milestones, CheckIns.
- Progress calculation logic (see Section 5.3) — this is pure arithmetic, entirely in `lib/dummy-store.ts`.
- RAG scoring — configurable thresholds, compares progress % to two threshold values.
- Code generation — sequential codes scoped to a parent (OBJ-001 scoped to dept+venture, KR-001 scoped to parent objective).

**Key files to copy:**
- `lib/dummy-store.ts` (the business logic: progress calc, RAG, code generation, CRUD)
- `lib/types.ts` (all TypeScript types)

**To adapt for a different backend:** Replace the `syncObjectToSharePoint` calls with calls to your own database. The in-memory store pattern itself is a good performance optimisation for any backend that has latency (PostgreSQL row-level operations, external REST APIs, etc.).

### 17.2 Role-based access control

**What you need:**

- A table of `{email, role}` pairs.
- A "default role" entry for unlisted users.
- Guard functions that check role before mutating.
- Role hierarchy: Admin(40) > Manager(30) > Editor(20) > Viewer(10).

**Key files to copy:**
- `app/api/_utils/admin-guard.ts`
- `app/api/_utils/department-owner-guard.ts`
- The role resolution logic in `lib/store.ts` (the `getUserRole` function with fallback to default)

**To adapt:** Replace `isAdminEmail()` and `getUserRole()` with calls to your own user/role store.

### 17.3 Activity log with field diffs

**What you need:**

- An activity log table with columns: `userEmail`, `activityName`, `httpMethod`, `routePath`, `entityType`, `entityKey`, `entityLabel`, `detailsJson`, `occurredAt`.
- A diff function that compares before/after objects.
- A middleware wrapper that logs after successful mutations.

**Key files to copy:**
- `app/api/_utils/user-activity-log.ts` (diff builder + log writer)
- `app/api/_utils/with-operation-progress.ts` (the middleware pattern)
- `app/activity/page.tsx` (the feed UI)

**How the diff works:**
```typescript
function buildActivityDiff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changes = [];
  for (const key of allKeys(before, after)) {
    const from = before[key];
    const to = after[key];
    if (from !== to) {
      changes.push({ field: key, from, to });
    }
  }
  return JSON.stringify({ changes });
}
```

**To adapt:** Replace `logUserActivity()` with an insert into your own activity log table. The diff function has no dependencies and can be copied verbatim.

### 17.4 Comment threads with @mentions

**What you need:**

- A comments table: `entityType`, `entityKey`, `body`, `authorEmail`, `authorName`, `createdAt`.
- A user search endpoint (to power the @mention dropdown).
- An email send function.
- Client: a textarea that intercepts `@` keystrokes and shows a dropdown.

**Key files to copy:**
- `app/api/comments/route.ts` (list + create with mention detection)
- The @mention rendering logic from the chat component
- The `sendMentionNotifications()` function from `lib/notifications.ts`

**To adapt:** Replace the Graph `sendMail` call with any email provider (SMTP, SendGrid, Resend, etc.). Replace the `GET /api/users/suggest` backend with a query against your own user directory.

**@mention token format:** The app stores tokens as `@[Display Name]` in the message body. This is unambiguous (handles names with spaces), easy to search with a regex, and renders well as a highlighted span.

### 17.5 Notification/reminder system

**What you need:**

- A rule definition structure: `{ id, label, schedule: { kind, dayOfWeek/dayOfMonth, hour, minute }, message }`.
- A schedule matcher that evaluates rules against the current time in a configured timezone.
- An email builder that aggregates multiple rules into one email per recipient.
- A cron-triggered endpoint that calls the scheduler.
- An admin UI to enable/disable rules, change schedules, and trigger manually.

**Key files to copy:**
- `lib/notification-rules.ts` (rule definitions + schedule matching)
- `lib/run-reminders.ts` (build + send aggregated reminders)
- `lib/notifications.ts` (HTML email builder)
- `app/notification-actions-section.tsx` (admin UI)
- `app/api/notifications/remind/route.ts` (manual send API)
- `app/api/notifications/scheduled/route.ts` (cron endpoint)

**Important design decisions:**
1. **Aggregated emails** (one per owner, not one per rule) avoid inbox spam when multiple rules fire close together.
2. **Schedule matching uses a time window** (15 minutes). A 15-minute cron calls the endpoint; any rule whose scheduled time falls within the last 15 minutes fires exactly once.
3. **Timezone offset** is applied by shifting the UTC clock: `new Date(now.getTime() + offsetHours * 3600000)`. This avoids Node.js timezone libraries.
4. **Settings stored on filesystem** (`notification-settings.json` in `data/`) rather than in the database. Simple, avoids a settings table, and is preserved across deploys by marking `data/` as a preserved directory.

**To adapt:** Replace `sendAggregatedReminders()` with your own email provider. Replace `gatherRuleContent()` with queries against your own OKR data tables.

### 17.6 AI chat with live data context

**What you need:**

- An OpenAI API key.
- A function to build a system prompt from your live data.
- A streaming SSE/plain-text endpoint.
- A floating chat UI that renders streamed text.

**Key files to copy:**
- `app/api/ai/chat/route.ts` (system prompt builder + OpenAI streaming)
- `app/ai-global-chat.tsx` (floating panel UI)

**System prompt pattern:**
```
You are an OKR assistant. Here is the current state:

ACTIVE PERIODS: Q1 2026 (Jan 1 – Mar 31)

OBJECTIVES (3 total):
- OBJ-001: Grow revenue 20% — 65% complete — Amber — Owner: Alice
  KR-001: Acquire 50 new customers — 40% (20/50) — Red
  KR-002: Upsell 30% of existing — 80% — Green
...
```

The context is built from a snapshot of live data, cached for 10 minutes. Every message includes this full context, so the model always has up-to-date information.

### 17.7 Sidebar navigation with role-gated links

The sidebar in `app/app-shell.tsx` demonstrates:
- Hover-to-expand on desktop, hamburger menu on mobile.
- Nav links that preserve filter query params across navigation.
- Role-gated links (Config shown only to admins, Activity only to Manager+).
- Version label always visible.
- SharePoint connection status indicator.

The role gate on the client works by calling `GET /api/authz/me` on mount and storing `isAdminUser` and `userRole` in local state. Nav links conditionally render based on these values. The server-side guards are the authoritative check — the client-side hiding is UX only.

---

*End of manual. For questions or to report issues, see the project repository.*
