# Changelog

All notable changes to this project are documented here.
Versioning follows [Semantic Versioning](https://semver.org/): MAJOR.MINOR.PATCH.
- **PATCH** — bug fixes, no new features
- **MINOR** — new features, backwards-compatible
- **MAJOR** — breaking changes

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
