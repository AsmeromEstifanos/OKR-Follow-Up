# Changelog

All notable changes to this project are documented here.
Versioning follows [Semantic Versioning](https://semver.org/): MAJOR.MINOR.PATCH.
- **PATCH** — bug fixes, no new features
- **MINOR** — new features, backwards-compatible
- **MAJOR** — breaking changes

---

## [0.5.38] — 2026-05-20
### Changed
- Activity Log "User email" filter is now a dropdown of the emails that appear in the activity log (collected over the last year) instead of a free-text field

---

## [0.5.37] — 2026-05-20
### Fixed
- Activity Log detail popup no longer shows the internal Period key (e.g. "P-CURRENT") — it isn't meaningful to users

---

## [0.5.36] — 2026-05-20
### Changed
- Activity Log detail popup now shows the clicked objective's or key result's current details (as on the OKR board) — all fields in a labelled list — instead of re-showing the field changes already visible in the row; shows a "no longer exists" message if the item was deleted
- Styled the shared `btn-primary` / `btn-secondary` buttons (Show Insights, Apply, etc.) which previously rendered as unstyled browser-default buttons

---

## [0.5.35] — 2026-05-20
### Added
- In-app Help & User Guide page (`/help`): searchable, browsable documentation for end users with category filters and a jump-to-section table of contents
- Help nav link added to the sidebar (visible to all signed-in users)
- Two reference documents added to the repo: `OKR_Follow_Up_User_Guide.md` (non-technical) and `OKR_Follow_Up_Manual.md` (technical)

---

## [0.5.34] — 2026-05-20
### Changed
- Send Reminders dialog now has a rule selection step (Step 1) before recipient selection — choose which of the enabled reminder types to include in the manual send batch
- API: GET `/api/notifications/remind` returns `ruleMenu` (all enabled rules with labels and schedule descriptions); accepts optional `?ruleIds=` query param to scope the preview
- API: POST `/api/notifications/remind` accepts `ruleIds` in the request body to limit which rules are run

---

## [0.5.33] — 2026-05-20
### Added
- Activity log entries are now clickable — opens a popup with full change details instead of a broken link
- Config > Roles: "Default role for unlisted users" setting — users not individually assigned a role inherit this role
- Editor role now enforces owns-only access: Editors can only create/update objectives and key results they are listed as owner of

### Fixed
- Activity tab no longer highlights two nav items simultaneously (OKR Board was always-active when not on dashboard/config)

## [0.5.32] — 2026-05-20
### Fixed
- ByteString encoding error when saving KRs/objectives with codes: removed em dash from entity label headers, non-ASCII characters are now stripped before writing to SharePoint
- Activity log now shows "key result" / "objective" instead of raw entity type slugs ("kr", "krs")

## [0.5.31] — 2026-05-20
### Fixed
- Activity Log now displays human-readable sentences ("Updated key result **KR-01 — Title** · Progress changed from 40% to 85%") instead of raw technical strings
- Field changes show friendly names (e.g. "Current value", "Progress", "Status") with color-coded from/to values
- Create routes (POST) for objectives and key results now record the item's code/title as the entity label

## [0.5.30] — 2026-05-20
### Added
- Activity Log page (`/activity`): timeline feed grouped by day with per-entry field-change diffs (from→to), HTTP method badges, and clickable entity links
- Insights panel on Activity page: summary stats, daily volume bar chart, entity type breakdown, top users, most-changed items
- `/api/activity` route with date range, period shorthand (today/week/month/quarter/year), entity type and user email filters, cursor-based load-more pagination; requires Manager or Admin role
- Role groups (Admin/Manager/Editor/Viewer) now control access: Activity nav link and API are restricted to Manager+ 
- Before/after diffs captured on Objective and KR PATCH routes; stored in `detailsJson` for display in the activity feed

## [0.5.29] — 2026-05-20
### Fixed
- Non-measurable KR save no longer errors with "targetValue must be a valid number" — PATCH route now accepts null for baselineValue, targetValue, and currentValue

---

## [0.5.28] — 2026-05-20
### Changed
- Non-measurable KR toggle is now an iOS-style sliding switch; KR Progress % column updates live to 100% / 0% while editing

---

## [0.5.27] — 2026-05-20
### Fixed
- Non-measurable KR inline edit: Done/Not Done replaced with a single toggle button in the Current column
- `progressPct` added to allowed PATCH fields so non-measurable KR saves no longer return a read-only error

---

## [0.5.26] — 2026-05-20
### Fixed
- Inline KR row editor: Done/Not Done buttons now appear in the KR Progress % column (not the Current column); KR Type dropdown moved to the KR name cell alongside other edit controls; Target and Current columns show inputs only for measurable KRs

---

## [0.5.25] — 2026-05-20
### Changed
- Add KR form (board row) now shows a KR Type dropdown (Measurable / Non-measurable) instead of free-text "Measurement Rule"; Baseline/Target/Current inputs shown for measurable, Done/Not Done buttons shown for non-measurable
- Owner Email now auto-populates from the parent objective's owner when opening the Add KR form
- KR edit form (objective detail page) also shows KR Type dropdown with the same conditional fields; existing non-measurable KRs (null target/current) are detected automatically

---

## [0.5.24] — 2026-05-20
### Changed
- KR types renamed: "Measurable" (numeric target/current) and "Non-measurable" (Done/Not Done only, 0 or 100%)
- Non-measurable KRs show Done/Not Done toggle buttons instead of a progress % input, matching the milestone binary pattern
### Fixed
- @mention tokens now stored as `@[Display Name]` in message bodies — highlighting is unambiguous and works correctly for all names regardless of spaces or similar names

---

## [0.5.23] — 2026-05-20
### Added
- Key Results now support two types, matching milestones:
  - **Measurable** — has numeric Target / Current values; progress calculated automatically
  - **Milestone-based** — no Target/Current; progress set directly as a % (driven by child milestones or manual entry)
- KR Type selector in both the Add KR form and the inline KR edit row
- `targetValue` / `currentValue` are now nullable on `KeyResult` (null = milestone-based)

---

## [0.5.22] — 2026-05-20
### Fixed
- @mention highlights now appear for historical messages: on thread load, each @token in existing comment bodies is resolved to a full display name via the suggest API, so the known-names set is populated before rendering

---

## [0.5.21] — 2026-05-20
### Fixed
- @mention highlighting uses exact known names (seeded from author names in the thread and from dropdown selections) instead of a fragile capitalization heuristic — eliminates false highlights on capitalized words

---

## [0.5.20] — 2026-05-20
### Fixed
- @mention highlight now covers the full name (e.g. `@Asmerom Estifanos` highlighted as one token, not just `@Asmerom`)

---

## [0.5.19] — 2026-05-19
### Fixed
- @mention dropdown: name and email now left-aligned within each row

---

## [0.5.18] — 2026-05-19
### Changed
- @mention dropdown now inserts the full display name (e.g. `@Asmerom Estifanos`) instead of just the first name

---

## [0.5.17] — 2026-05-19
### Fixed
- Chat bubbles from other users now left-align correctly (text and bubble were centering due to missing `align-items: flex-start` on the content column)

---

## [0.5.16] — 2026-05-19
### Changed
- Removed all mention-debug logging and `_mentionDebug` field from chat POST response

---

## [0.5.15] — 2026-05-19
### Fixed
- @mention email not sent when the author mentions themselves — the client was filtering out the sender's own email before posting; removed that filter so self-mentions are delivered

---

## [0.5.14] — 2026-05-19
### Fixed
- @mention emails now send even when the user types `@name` manually (not via dropdown): at submit time all `@tokens` in the body are resolved to emails via `/api/users/suggest` before the POST, so only dropdown selection is no longer required
- Restored email preview pane in Send Reminders dialog (Preview button → iframe showing the exact email each recipient will receive, with recipient switcher)

---

## [0.5.13] — 2026-05-19
### Fixed
- Mention debug info now returned in POST response body as `_mentionDebug` and shown in chat UI, making the failure visible without server log access

---

## [0.5.12] — 2026-05-19
### Changed
- Version label now always visible in sidebar — shows `v0.5.12` when collapsed, `Version 0.5.12` when expanded
### Fixed
- Added server-side console logging throughout the mention-notify path to diagnose why emails aren't sending

---

## [0.5.11] — 2026-05-19
### Fixed
- @mention emails not sending: `mentionedEmails` was read from a stale React state closure in `handleSubmit`. Replaced state with a `useRef` so the submit handler always sees the emails added during the current draft, regardless of render timing.

---

## [0.5.10] — 2026-05-19
### Fixed
- Mention notification misconfiguration now throws (instead of silently returning) so the exact missing piece (config vs fromEmail) surfaces in the chat UI error message

---

## [0.5.9] — 2026-05-19
### Fixed
- Mention notification errors are now awaited and surfaced: if the Graph email send fails, the exact error is returned in the POST response and shown in the chat UI, making it diagnosable without needing server logs

---

## [0.5.8] — 2026-05-19
### Added
- **@mention support in chat** — type `@` in the message box to get a live dropdown of Azure AD users; select with keyboard (↑↓, Enter/Tab) or click; the chosen user's first name is inserted as a highlighted `@token` in the message
- Mentioned users receive an email notification (via Graph API, same sender as reminder emails) with the message preview and a direct link to open the discussion — fires asynchronously so it never delays posting
- `@tokens` in existing messages are rendered with a teal highlight so mentions stand out visually

---

## [0.5.7] — 2026-05-19
### Changed
- Notification panel items now show department as first line (in accent color), OBJ/KR code as second line, title bold if unread
- Last message preview (author + truncated body) shown below title
- Relative timestamp (e.g. "5m ago", "2h ago") shown alongside count badge
- Removed 9+ cap on message counts — shows actual number
- Count badge and time stacked on the right side of each item

---

## [0.5.6] — 2026-05-19
### Fixed
- operation-progress 404s on comment POST: exclusion checks were using trailing-slash prefix (`/api/comments/`) which never matched the exact path `/api/comments` (no slash). Fixed in both `shouldTrackSharePointRequest` and `shouldAttachOperationProgress` by checking `=== "/api/comments" || startsWith("/api/comments/")` pattern for comments, notifications, and ai routes.

---

## [0.5.5] — 2026-05-19
### Changed
- Notification panel now shows **all** chat threads (read and unread), not just unread ones
- Unread threads sort to the top, display a bold title, light green background, and red count badge
- Read threads display muted title and grey count badge
- Empty state updated to "No chat messages yet"

---

## [0.5.4] — 2026-05-19
### Fixed
- Notification badge no longer clears immediately when chat opens — `lastRead` is now stamped with the **newest message's `createdAt`** on modal close, not with the current time, so only messages posted after the user's last view are treated as unread next session

---

## [0.5.3] — 2026-05-19
### Fixed
- Notifications clear only when the chat modal is **closed**, not when it opens
- Bell badge recomputes immediately in the same tab via custom `okr-chat-last-read-updated` event dispatched from `setLastRead`

---

## [0.5.2] — 2026-05-19
### Fixed
- **404 on notification click** — `entityHref` was using `withBasePath("/")` which returned `/okr`, then Next.js `<Link>` prepended basePath again producing `/okr/okr?openChat=…`; reverted to plain `/?openChat=…` which Next.js handles correctly
- **Notification click not opening chat modal** — switched `ChatIconButton` from `window.location.search` (read once on mount) to `useSearchParams` so the `?openChat=…` param is detected on client-side navigation without a full page reload; wrapped in `Suspense` as required by Next.js App Router
- **Console 404 errors on comment POST** — excluded `/api/comments/`, `/api/notifications/`, and `/api/ai/` from operation-progress polling (these routes don't use `withOperationProgress`)
- **Badge showing all messages red** — `ChatIconButton` now tracks `unreadCount` separately from `totalCount`; red badge shows only new messages since last read
- **Notification breadcrumb** — panel now shows explicit `OBJ A13 › KR KR-2` format
- Enriched counts API with `code`, `parentObjectiveCode`, and `timestamps` fields for accurate per-user unread computation

---

## [0.5.1] — 2026-05-18
### Changed
- Repurposed sidebar bell as chat notifications panel
- Moved Send Reminders button to Config page
- Restyled Config page with tabs and compact remove controls
- Moved notification settings to Config page

---

## [0.3.0] — prior
### Added
- Configurable notification rules with editable schedule and message per rule
- Notification schedules evaluated in operations timezone (not UTC)
- Reminder email preview
- Recipient selection and progress states for Send Reminders
- Persistent reminder log in notification panel
- Aggregate scheduled reminders into one email per owner

---

## [0.2.0] — prior
### Added
- OKR board search and toolbar relocation
- Portal notification panel
- Custom send-reminders confirm popup
- AI summary panel

---

## [0.1.0] — initial
### Added
- First working version with Microsoft sign-in
- OKR board with objectives and key results
- Dashboard view
- cPanel deployment workflow with GitHub Actions
- SharePoint Lists backend via Microsoft Graph API
- Azure AD (MSAL) authentication
- AI chat and summarize features (OpenAI)
- Comment/discussion threads per objective and key result
- Check-ins, milestones, periods
