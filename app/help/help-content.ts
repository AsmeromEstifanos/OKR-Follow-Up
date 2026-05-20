// Searchable in-app help content. Mirrors OKR_Follow_Up_User_Guide.md — keep
// the two in sync when features change.

export type HelpSection = {
  id: string;
  title: string;
  category: string;
  // Plain-text body. Newlines separate paragraphs; "- " lines render as bullets.
  body: string;
};

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "what-is-this",
    title: "What is this app for?",
    category: "Getting started",
    body: `OKR Follow-Up helps your organisation set goals and track progress toward them. "OKR" stands for Objectives and Key Results.

An Objective is something you want to achieve (e.g., "Grow our customer base").
A Key Result is a measurable way to know you're getting there (e.g., "Sign 50 new customers this quarter").

The app lets you create these goals, update your progress, discuss them with colleagues, and get email reminders so nothing slips through the cracks.`
  },
  {
    id: "signing-in",
    title: "Signing in",
    category: "Getting started",
    body: `When you open the app, click Sign in and use your normal work Microsoft account (the same one you use for email and Teams). You won't need a separate password — it uses your company login.

Once you're signed in, your name appears at the bottom of the sidebar, and you'll see everything you have permission to view.`
  },
  {
    id: "navigation",
    title: "Finding your way around",
    category: "Getting started",
    body: `On the left side of the screen is the sidebar menu. Hover over it (on a computer) or tap the menu button (on a phone) to expand it. You'll see:

- Dashboard — a bird's-eye view of all goals and how they're progressing
- OKR Board — the main working area where you create and update goals
- Activity — a history of changes (visible to managers and admins)
- Config — settings for the app (visible to admins only)
- Help — this guide

At the very bottom you'll see your name, the app's connection status, and the version number. At the top of the sidebar is the notification bell — it tells you when there are new messages in discussions you care about.`
  },
  {
    id: "okr-board",
    title: "The OKR Board",
    category: "Working with goals",
    body: `The OKR Board is where most of your work happens. It shows a list of objectives, each with its key results underneath.

For each objective you'll see its code and title, who owns it, a progress bar, a coloured status badge (red, amber or green), a chat bubble to open the discussion, and a warning icon if it hasn't been updated recently.

Filtering the view: Use the toolbar at the top to narrow down what you see — by venture, department, time period, owner, or status. This is handy when you only want to look at your own team's goals.

Expanding an objective: Click an objective to reveal its key results listed underneath.`
  },
  {
    id: "create-objective",
    title: "Creating an Objective",
    category: "Working with goals",
    body: `1. Click the Add Objective button.
2. Fill in the form: Title (what you want to achieve), Description (optional), Department, Venture, Strategic Theme, OKR Cycle, Owner (name and email), Status and Type.
3. Click Save.

The app automatically gives your objective a code like "OBJ-001". A short progress bar will appear while it saves.

Note: Depending on your role, you may only be able to create objectives that you own.`
  },
  {
    id: "add-key-results",
    title: "Adding Key Results",
    category: "Working with goals",
    body: `Under each objective there's an Add KR button. Key results are the measurable steps toward the objective.

1. Click Add KR beneath the objective.
2. Choose the KR Type:
- Measurable — has numbers (a starting point, a target, and a current value). For example: "Sign new customers — start: 0, target: 50, current: 20."
- Non-measurable — a simple Done / Not Done item.
3. Fill in the title, owner, and the relevant fields.
4. Click Save.

The owner's name automatically fills in from the parent objective, but you can change it.`
  },
  {
    id: "update-progress",
    title: "Updating your progress",
    category: "Working with goals",
    body: `Keeping progress up to date is the whole point of the app. To update a key result:

1. On the OKR Board, click the key result row to open it for editing.
2. For measurable KRs: update the Current value. The progress percentage recalculates automatically.
3. For non-measurable KRs: click the Done / Not Done toggle.
4. The change saves automatically.

As your key results progress, the parent objective's progress bar and colour update on their own.

Tip: Update your progress at least once a week. If a goal goes more than 7 days without an update during an active period, it gets flagged with a warning icon.`
  },
  {
    id: "rag-status",
    title: "Understanding the colours (RAG status)",
    category: "Working with goals",
    body: `Every objective shows a colour that tells you its health at a glance. This is called RAG status (Red, Amber, Green):

- Green — On track — typically 70% or more progress
- Amber — Needs attention — typically between 40% and 70%
- Red — At risk — typically below 40%

The exact thresholds can be adjusted by your admin, so they may differ slightly in your organisation.`
  },
  {
    id: "dashboard",
    title: "The Dashboard",
    category: "Working with goals",
    body: `The Dashboard gives you the big picture. Instead of editing individual goals, it summarises how everything is going: how many objectives are green, amber and red, average progress across teams, and a breakdown by venture and department.

Three ways to look at it:
- Overview — everything, grouped by team
- Department — click a department to focus on just that team
- Objective — click an objective to see all its key results and milestones in detail

Use the filters at the top to focus on a particular venture or department.`
  },
  {
    id: "discussions",
    title: "Discussions & chat",
    category: "Collaboration",
    body: `Every objective and every key result has its own discussion thread — like a mini chat room for that specific goal.

To open a discussion, click the chat bubble icon on any objective or key result row. A panel opens where you can read past messages, type and post a new message, and see who said what and when.

This is the place to discuss blockers, ask questions, or celebrate wins — all kept neatly attached to the relevant goal.`
  },
  {
    id: "mentions",
    title: "Mentioning colleagues",
    category: "Collaboration",
    body: `To get a colleague's attention in a discussion, mention them:

1. While typing a message, type the @ symbol.
2. A dropdown appears listing your colleagues.
3. Start typing their name and select them (use arrow keys + Enter, or click).
4. Their name is inserted into your message, highlighted in teal.

When you post the message, the people you mentioned receive an email notification with a preview of your message and a direct link to the discussion. This is the best way to make sure someone sees something important.`
  },
  {
    id: "notification-bell",
    title: "The notification bell",
    category: "Collaboration",
    body: `The bell icon at the top of the sidebar keeps you informed about discussions.

- A red number on the bell shows how many discussions have new messages you haven't read yet.
- Click the bell to open a list of all discussions, with unread ones at the top.
- Each item shows the latest message and how long ago it was posted.
- Click any item to jump straight to that discussion.

Once you open and read a discussion, it stops counting as unread.`
  },
  {
    id: "email-reminders",
    title: "Email reminders",
    category: "Reminders & AI",
    body: `The app can send you helpful email reminders so you remember to keep your goals up to date. These are sent automatically on a schedule. There are five types:

- Weekly Digest — Monday morning — a summary of all your objectives
- End-of-Week Reflection — Friday afternoon — your objectives and key results, to review before the weekend
- Mid-Month Checkpoint — 15th of the month — only the goals that need attention (amber and red)
- Third-Week Focus — 22nd of the month — goals falling behind, so you can catch up before month-end
- Month-End Readiness — last working day — a full snapshot to make sure everything is up to date

Each email gathers all the relevant reminders into one tidy email rather than flooding your inbox.

For admins: You can also send these reminders manually at any time, choose which types to send, and pick who receives them.`
  },
  {
    id: "ai-assistant",
    title: "The AI assistant",
    category: "Reminders & AI",
    body: `In the corner of the screen there's an AI chat assistant. You can ask it questions about your OKRs in plain English, such as:

- "Which of my objectives are behind schedule?"
- "Summarise the sales team's progress this quarter."
- "What key results are still at zero?"

The assistant knows about your current goals and answers based on the live data. It's a quick way to get insights without digging through the board yourself.`
  },
  {
    id: "activity-log",
    title: "Activity log (for managers)",
    category: "For managers & admins",
    body: `If you're a Manager or Admin, you'll see an Activity menu item. This is a complete history of every change made in the app: who changed what and when, exactly what was updated (for example, "Progress changed from 40% to 85%"), with filters by date, team, type of item, or person.

Click any entry to open a popup. For objectives and key results, the popup shows the item's current details exactly as they appear on the OKR board — title, owner, progress, target and current values, status, dates, notes, blockers and more — so you can see the full picture of the item, not just what changed. If the item has since been deleted, the popup tells you so.

There's also an Insights panel showing activity trends, the most active users, and the most-changed goals.

This is useful for keeping an eye on team activity and understanding how goals have evolved over time.`
  },
  {
    id: "config",
    title: "Settings & configuration (for admins)",
    category: "For managers & admins",
    body: `If you're an Admin, you'll see a Config menu item with several tabs:

- Admins — grant admin access to people
- Roles — assign roles (Admin, Manager, Editor, Viewer) and set a default role for everyone else
- Field Options — customise the dropdown choices (objective types, statuses, etc.)
- RAG — set the green/amber/red progress thresholds for your organisation
- Ventures — set up your organisation structure: ventures and their departments
- Notifications — turn reminder emails on/off, change their schedules, edit their wording, and send them manually

Sending reminders manually: In the Notifications tab, click Send Reminders Now. You'll go through three quick steps: choose which reminders to send, choose who receives them (you can preview the exact email each person will get), then send and see a confirmation of how many were sent.`
  },
  {
    id: "roles",
    title: "What you can do based on your role",
    category: "For managers & admins",
    body: `Your role determines what you're allowed to do. There are four roles:

- Viewer — look at everything, but not change anything
- Editor — create and update only the objectives and key results that you own
- Manager — view everything, create any objective or key result, and see the Activity log
- Admin — everything, including settings, roles, and sending reminders

If you're not sure what your role is, ask your administrator. People who haven't been assigned a role get a default role chosen by the admin.`
  },
  {
    id: "faq",
    title: "Frequently asked questions",
    category: "Help",
    body: `I can't create or edit a goal — why? Your role may not allow it. Editors can only edit goals they own; Viewers can't edit at all. Ask your admin to check your role.

A goal shows a warning icon. What does that mean? It hasn't been updated in over a week during an active period. Open it and update its progress to clear the warning.

Why didn't I get a reminder email? Reminders only go to people who own active objectives or key results. If you don't own any active goals, you won't be on the list. Also check your spam folder.

I mentioned someone but they say they didn't get an email. Make sure you selected them from the @ dropdown (so their name appears highlighted). Ask them to check their spam folder too.

The progress percentage looks wrong. For measurable key results, progress is calculated as how far the current value has moved from the starting value toward the target. Double-check the baseline, target, and current numbers are correct.

How do colours (red/amber/green) get decided? Automatically, based on the progress percentage. Your admin sets the exact thresholds in the RAG settings.

Can I change someone else's goal? Only if you're a Manager or Admin. Editors can only change their own goals.`
  }
];

export const HELP_CATEGORIES: string[] = Array.from(
  new Set(HELP_SECTIONS.map((section) => section.category))
);
