# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Versioning

Every commit with code changes must update three things together:
1. `version` in `package.json` — semver: patch for bug fixes, minor for new features
2. The fallback version string in `app/app-shell.tsx` (search `NEXT_PUBLIC_APP_VERSION` — two occurrences)
3. A new entry in `CHANGELOG.md` under `## [x.y.z] — YYYY-MM-DD`

## Commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit (run this before committing)
npm run start        # Production server (standard)
npm run start:cpanel # Production server (cPanel, uses app.js)
```

There is no test suite — `typecheck` and `lint` are the only automated correctness checks.

## Architecture

Next.js 14 App Router application for OKR management. Backend is SharePoint Lists accessed via Microsoft Graph API; auth is Azure AD (MSAL).

### Data layer

**`lib/store.ts`** is the public facade. All API routes import from here. It hydrates from SharePoint on first request, holds data in-memory for the request lifecycle, and writes mutations back to SharePoint atomically.

**`lib/dummy-store.ts`** is the in-memory store implementation — the source of truth during runtime. It is large (~58KB) and contains all CRUD logic plus business rules (progress calculation, RAG scoring, missing check-in detection).

**`lib/sharepoint/server-storage.ts`** is the SharePoint adapter. It maps between the app's TypeScript types and SharePoint List columns. There are 7 main lists (all prefixed by `SHAREPOINT_STORAGE_LIST`): Ventures, Periods, Objectives, Key Results, Milestones, Check-Ins, Config, plus Comments, Role Assignments, Auth Log, Activity Log.

### Auth

Two separate MSAL flows run in parallel:

- **Delegated (browser)**: `lib/auth/msal-client.ts` — PublicClientApplication; used for user sign-in and client-side Graph calls (site probe, user suggestions).
- **Application (server)**: Client credentials (`AZURE_APP_CLIENT_ID` + `AZURE_APP_CLIENT_SECRET`); used by all API routes for SharePoint CRUD and Graph API calls. Never involves the signed-in user's token.

The `x-user-email` HTTP header carries the user's identity into API routes (set by the client from the MSAL account). Authorization guards are in `app/api/_utils/`.

### API routes

All routes live in `app/api/`. Pattern: `GET` = list/read, `POST` = create, `PATCH` = update, `DELETE` = remove. Every route exports `export const dynamic = "force-dynamic"` to skip Next.js caching. Long-running mutations use `app/api/_utils/with-operation-progress.ts` to stream progress back to the client.

### URL base path

The app can be deployed under a sub-path (e.g. `/okr`) via `NEXT_PUBLIC_BASE_PATH`. Always use `withBasePath()` / `apiPath()` from `lib/base-path.ts` when constructing paths — never hardcode `/`. Using a bare `"/"` href inside a Next.js `<Link>` when basePath is set produces a trailing-slash URL (`/okr/`) that resolves to a 404.

### Notifications / Chat

Comment threads are per-entity (objective or KR). `lib/comment-counts.ts` provides a client-side cache of counts fetched from `/api/comments/counts`. The notification bell in `app/notification-bell.tsx` computes per-user unread counts by comparing message timestamps against a `localStorage` last-read marker keyed by `okr-chat-last-read::<entityType>::<entityKey>::<email>`. The same key is written by `app/chat-icon-button.tsx` when a thread is opened.

### AI features

OpenAI (`openai` npm package) powers chat and summaries via `app/api/ai/chat/route.ts` and `app/api/ai/summarize/route.ts`. Requires `OPENAI_API_KEY`. The routes build OKR context from the live store and pass it as system prompt.

### OKR business rules (in `lib/dummy-store.ts`)

- KR progress: `((current − baseline) / (target − baseline)) × 100`, clamped 0–100
- Objective progress: weighted average of child KR progress
- Missing check-in: >7 days without update during an Active period
- RAG thresholds: configurable per-venture in the Config list

## Environment variables

| Variable | Where used |
|---|---|
| `NEXT_PUBLIC_BASE_PATH` | URL prefix (e.g. `/okr`) |
| `NEXT_PUBLIC_AZURE_CLIENT_ID` | MSAL delegated auth |
| `NEXT_PUBLIC_AAD_TENANT_ID` | MSAL delegated auth |
| `NEXT_PUBLIC_REDIRECT_URI` | MSAL redirect |
| `NEXT_PUBLIC_SHAREPOINT_SITE_URL` | Client-side site probe |
| `NEXT_PUBLIC_SHAREPOINT_STORAGE_LIST` | List name prefix (client) |
| `AZURE_APP_TENANT_ID` | Server-side Graph auth |
| `AZURE_APP_CLIENT_ID` | Server-side Graph auth |
| `AZURE_APP_CLIENT_SECRET` | Server-side Graph auth |
| `SHAREPOINT_SITE_URL` | Server-side SharePoint URL |
| `SHAREPOINT_STORAGE_LIST` | List name prefix (server) |
| `OPENAI_API_KEY` | AI chat/summary (optional) |
| `NOTIFICATION_FROM_EMAIL` | Reminder email sender (optional) |
| `SCHEDULER_SECRET` | Scheduled job auth (optional) |

Legacy `REACT_APP_*` prefixes are aliased in `next.config.mjs`.

## Deployment

Deployed to cPanel via GitHub Actions (`.github/workflows/deploy-cpanel.yml`). The workflow typechecks and builds, tarballs `.next/`, `app/`, `lib/`, `public/`, and config files, SCPs to the server, runs `npm ci --omit=dev`, and restarts via Passenger (`tmp/restart.txt`). Server secrets are written from GitHub Actions secrets into `.env.deploy` at deploy time. The `data/` directory (notification-settings.json) and `.env` are preserved across deploys.
