# OKR Follow-Up User Manual

## 1. Overview

OKR Follow-Up is used to manage ventures, positions, objectives, key results, and reporting in one place.

The application has three main areas:

- `Dashboard`
- `OKR Board`
- `Config`

`Config` is visible only to admins.

## 2. Signing In

To use the app:

1. Open the OKR Follow-Up site.
2. Click `Sign In`.
3. Sign in with your Microsoft work account.
4. Wait for the app to load your access.

The left sidebar shows:

- `Dashboard`
- `OKR Board`
- `Config` for admins

The sidebar footer shows:

- Your signed-in account
- `Sign Out`
- SharePoint connection status

## 3. Roles

### 3.1 Signed-In Users

Signed-in users can:

- Open `Dashboard`
- Open `OKR Board`
- View ventures, positions, objectives, and key results

### 3.2 Admins

Admins can:

- Open `Config`
- Add, rename, and delete ventures
- Add, rename, and delete positions
- Add and remove admin users
- Update dropdown values
- Update RAG thresholds
- Create and edit objectives
- Create and edit key results

### 3.3 Position Owners

Position owners can:

- Create objectives in their position
- Create key results under objectives in their position
- Edit objectives in their position
- Edit key results in their position

### 3.4 Objective Owners

Objective owners can edit the objectives assigned to them.

### 3.5 KR Owners

KR owners can edit the key results assigned to them.

### 3.6 Ownership Notes

- Position owners are optional.
- Objective owners are optional.
- KR owners are optional.
- Empty owners are displayed as `-`.
- The same position name can exist in different ventures.

## 4. Navigation

### 4.1 Dashboard

Use `Dashboard` for reporting and roll-up views.

### 4.2 OKR Board

Use `OKR Board` for day-to-day work:

- switch ventures
- add or edit positions
- add or edit objectives
- add or edit key results

### 4.3 Config

Use `Config` for setup and administration.

## 5. OKR Board Layout

The board is organized like this:

1. Venture tabs across the top
2. Position sections inside the selected venture
3. Objectives inside each position
4. Key results inside each objective

## 6. Venture Tabs

Each venture appears as a tab at the top of the board.

You can:

- click a venture tab to switch the board to that venture
- use `Add Venture` if you are an admin
- use the pen icon on a venture tab to rename it if you are an admin
- delete a venture from the venture edit form if you are an admin

### 6.1 Adding a Venture

1. Click `Add Venture`.
2. Enter the venture name.
3. Click `Add venture`.

### 6.2 Editing a Venture

1. Hover the venture tab.
2. Click the pen icon.
3. Update the venture name.
4. Click `Save`.

## 7. Positions

Each venture contains one or more positions.

Examples:

- `CEO`
- `COO`
- `Finance`
- `Operations`

Each position header shows:

- position name
- position owner, if available
- objective count

You can:

- expand or collapse the position section
- use `Add Position` if you are an admin
- hover the position name to reveal the pen icon if you are an admin

### 7.1 Adding a Position

1. Open the correct venture tab.
2. Click `Add Position`.
3. Enter the position name.
4. Optionally choose a position owner.
5. Optionally confirm or enter the owner email.
6. Click `Add`.

Rules:

- position name is required
- position names must be unique inside the current venture

### 7.2 Editing a Position

1. Hover the position name.
2. Click the pen icon.
3. Update the position name, owner, or owner email.
4. Click `Save`.

Admins can also delete the position from the same edit area.

## 8. Objectives

Inside each position, the board shows an objectives table.

The table includes:

- Objective
- Owner
- Objective Type
- Health
- RAG
- Progress %
- OKR Cycle
- Blockers
- Key Risks/Dependancy
- Notes
- Last updated

### 8.1 Adding Objectives

Admins and position owners can add objectives.

1. Open the correct venture.
2. Expand the correct position.
3. Click `Add Objective`.
4. Review the generated objective code.
5. Optionally choose an owner.
6. Review the owner email if a person was selected.
7. Enter the objective text.
8. Choose `Objective Type`.
9. Choose `Health`.
10. Enter `Progress` or `Progress %`.
11. Choose `OKR Cycle`.
12. Fill `Blockers`, `Key Risks/Dependancy`, and `Notes` if needed.
13. Click `Save All`.

You can queue multiple objectives before saving:

1. Fill the first objective.
2. Click `Add More`.
3. Repeat for additional rows.
4. Click `Save All`.

### 8.2 Editing Objectives Inline

Admins, position owners, and objective owners can edit objectives inline on the board.

1. Hover the objective row.
2. Click the pen icon next to the objective title.
3. Update the fields you need.
4. Click `Save`.

Editable objective fields include:

- objective code
- title
- owner
- objective type
- health
- progress %
- OKR cycle
- blockers
- key risks or dependency
- notes

The `RAG` value is displayed in the table and follows the configured thresholds.

## 9. Key Results

Each objective has a collapsible `Key Results (n)` section underneath it.

When you expand it, you see:

- an add form for new key results if you have permission
- a key result table for that objective

The key result table includes:

- Key Result
- Owner
- KR Metric Type
- Baseline Value
- Target Value
- Current Value
- KR Progress %
- KR Status
- Due Date
- Check-in Frequency
- Blockers
- Key Risks/Dependancy
- Notes
- Last updated

### 9.1 Adding Key Results

Admins and position owners can add key results.

1. Expand the correct objective.
2. Open the `Key Results` section.
3. Click `Add Key Result`.
4. Review the generated KR code.
5. Enter the key result text.
6. Optionally choose an owner.
7. Review the owner email if a person was selected.
8. Choose `KR Metric Type`.
9. Enter `Baseline Value`.
10. Enter `Target Value`.
11. Enter `Current Value`.
12. Choose `KR Status`.
13. Choose `Due Date`.
14. Choose `Check-in Frequency`.
15. Fill `Blockers` and `Notes` if needed.
16. Click `Save All`.

You can queue multiple key results before saving:

1. Fill the first key result.
2. Click `Add More`.
3. Repeat for additional rows.
4. Click `Save All`.

### 9.2 Editing Key Results Inline

Admins, position owners, and KR owners can edit key results inline on the board.

1. Hover the key result row.
2. Click the pen icon next to the key result title.
3. Update the fields you need.
4. Click `Save`.

Editable key result fields include:

- KR code
- title
- owner
- KR Metric Type
- baseline value
- target value
- current value
- KR Progress %
- KR Status
- due date
- check-in frequency
- blockers
- notes

## 10. Dashboard

Open `Dashboard` from the sidebar.

The dashboard is the reporting view of the system.

### 10.1 Filters

You can filter the dashboard by:

- Venture
- Department

Use `Clear` to reset the filters.

### 10.2 Summary Area

At the top of the dashboard, you see:

- one `Avg Progress` card for the current scope
- an `Objective Progress` section
- a `Key Result Progress` section

The objective and key result sections use the configured dropdown values.

### 10.3 Venture Performance

The `Venture Performance` table shows ventures in two rows each:

- `Objectives`
- `Key Results`

Each row shows:

- Count
- On Track
- At Risk
- Off Track
- Avg Progress

### 10.4 Department Performance

The `Department Performance` table works the same way.

Each department is split into:

- `Objectives`
- `Key Results`

Each row shows:

- Count
- On Track
- At Risk
- Off Track
- Avg Progress

## 11. Config

`Config` is visible only to admins.

The page contains four sections:

- `Admin Users`
- `Dropdown Field Options`
- `RAG Definition`
- `Ventures`

## 12. Admin Users

The `Admin Users` section is used to grant and remove admin access.

### 12.1 Adding an Admin

1. Open `Config`.
2. In `Admin Users`, type a name or email.
3. Select the person when the suggestion appears.
4. Click `Add Admin`.

The admin list shows the person's name when available, with the email beside it.

### 12.2 Removing an Admin

1. Open `Config`.
2. Find the admin in the list.
3. Click `Remove`.

## 13. Dropdown Field Options

Admins can manage the option lists used across forms and the dashboard.

The editable groups are:

- `Objective Type`
- `Objective Health`
- `OKR Cycle`
- `KR Metric Type`
- `KR Status`
- `Check-in Frequency`

To update any option group:

1. Open `Config`.
2. Find the correct option card.
3. Add a value or remove a value.
4. Click `Save Dropdown Config`.

## 14. RAG Definition

Admins can define the thresholds used for RAG.

The page includes:

- `Green Min (%)`
- `Amber Min (%)`
- a live preview line

To update RAG:

1. Open `Config`.
2. Enter the new threshold values.
3. Review the preview.
4. Click `Save RAG`.

## 15. Ventures and Departments in Config

The `Ventures` section in `Config` is used for structure setup.

### 15.1 Adding a Venture

1. Open `Config`.
2. Enter the venture name.
3. Click `Add Venture`.

### 15.2 Deleting a Venture

1. Open `Config`.
2. Find the venture card.
3. Click `Delete`.

### 15.3 Adding a Department

1. Open `Config`.
2. Find the correct venture card.
3. Enter the department name.
4. Click `Add Department`.

### 15.4 Deleting a Department

1. Open `Config`.
2. Find the department under the venture card.
3. Click `Delete`.

## 16. Tips

- Use the board for daily work and inline updates.
- Use the dashboard for reporting and filters.
- Keep position names consistent within each venture.
- Use owners where accountability is needed, but remember they are optional.
- Review dropdown values in `Config` before changing reporting expectations.

## 17. Troubleshooting

### 17.1 I cannot see `Config`

Possible reasons:

- you are not signed in
- your account is not an admin

What to do:

1. Sign out and sign back in.
2. Confirm the correct work account is being used.
3. Ask an existing admin to add you.

### 17.2 I cannot save changes

Check:

- the SharePoint status in the sidebar
- your permission level
- that required fields are filled in

### 17.3 A screen looks stale

Try:

1. Refresh the browser tab.
2. Re-open the correct venture.
3. Re-expand the position or key result section you were using.

### 17.4 Two ventures have the same position name

This is supported.

The app keeps positions separate by venture, so a `CEO` in one venture is different from a `CEO` in another venture.

## 18. Quick Start

If you want the shortest path:

1. Sign in with Microsoft.
2. Open `OKR Board`.
3. Choose the correct venture tab.
4. Expand the correct position.
5. Add or edit objectives and key results if your role allows it.
6. Open `Dashboard` when you want reporting.
7. Open `Config` only if you are an admin.
