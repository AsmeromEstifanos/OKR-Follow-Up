import { readNotificationSettings } from "@/lib/notification-settings";
import {
  RULE_IDS,
  effectiveRule,
  ruleMatchesNow,
  type RuleId
} from "@/lib/notification-rules";
import {
  buildAggregatedEmail,
  sendAggregatedReminders,
  type AggregatedReminder,
  type RuleSection,
  type SendRemindersResult
} from "@/lib/notifications";
import { listKeyResults, listObjectives, listPeriods, logUserActivity } from "@/lib/store";
import type { KeyResult, Objective } from "@/lib/types";

export type ReminderRunResult = {
  ranAt: string;
  rulesRun: RuleId[];
  recipients: number;
  sendResult: SendRemindersResult | { error: string };
};

export type ReminderRecipientPreview = {
  email: string;
  name: string;
  summary: string;
  subject: string;
  html: string;
};

export type ReminderPreviewResult = {
  rulesIncluded: RuleId[];
  recipients: ReminderRecipientPreview[];
};

function lowerEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

// Returns the subset of enabled rules whose (admin-customised) schedule
// matches `now`.
export async function rulesFiringAt(now: Date, windowMinutes = 15): Promise<RuleId[]> {
  const settings = await readNotificationSettings();
  return RULE_IDS.filter((id) => {
    const cfg = settings.rules[id];
    if (!cfg?.enabled) return false;
    return ruleMatchesNow(effectiveRule(id, cfg), now, windowMinutes);
  });
}

type RuleContent = {
  objectives: Objective[];
  krs: KeyResult[];
};

// Each rule has its own filtering rules over the live OKR data — see the
// "What it shows" column in the notification settings table.
function gatherRuleContent(
  ruleId: RuleId,
  ownerEmail: string,
  allObjectives: Objective[],
  allKrs: KeyResult[],
  activePeriodKeys: Set<string>
): RuleContent {
  const ownerObjectives = allObjectives.filter(
    (obj) => activePeriodKeys.has(obj.periodKey) && lowerEmail(obj.ownerEmail) === ownerEmail
  );
  const ownerKrs = allKrs.filter(
    (kr) => activePeriodKeys.has(kr.periodKey) && lowerEmail(kr.ownerEmail) === ownerEmail
  );

  switch (ruleId) {
    case "weeklyDigest":
      // Monday snapshot: all owner objectives with RAG + progress.
      return { objectives: ownerObjectives, krs: [] };
    case "endOfWeekReflection":
      // Friday reflection: objectives RAG + KR progress.
      return { objectives: ownerObjectives, krs: ownerKrs };
    case "midMonthCheckpoint":
      // 15th of month: only Red/Amber objectives + their KRs.
      {
        const atRiskObjs = ownerObjectives.filter((o) => o.rag === "Red" || o.rag === "Amber");
        const atRiskKeys = new Set(atRiskObjs.map((o) => o.objectiveKey));
        const relatedKrs = ownerKrs.filter((kr) => atRiskKeys.has(kr.objectiveKey));
        return { objectives: atRiskObjs, krs: relatedKrs };
      }
    case "thirdWeekFocus":
      // 22nd: low-progress (<60%) or at-risk objectives, focus list.
      return {
        objectives: ownerObjectives.filter(
          (o) => o.progressPct < 60 || o.rag === "Red" || o.rag === "Amber"
        ),
        krs: []
      };
    case "monthEndReadiness":
      // Last working day: full progress snapshot.
      return { objectives: ownerObjectives, krs: ownerKrs };
    default:
      return { objectives: [], krs: [] };
  }
}

// Owner email -> name. First non-empty name wins.
function collectOwnerNames(allObjectives: Objective[], allKrs: KeyResult[]): Map<string, string> {
  const names = new Map<string, string>();
  const remember = (email: string, name?: string | null): void => {
    const e = lowerEmail(email);
    if (!e) return;
    const n = (name ?? "").trim();
    if (n && !names.get(e)) names.set(e, n);
  };
  for (const obj of allObjectives) remember(obj.ownerEmail ?? "", obj.owner);
  for (const kr of allKrs) remember(kr.ownerEmail ?? "", kr.owner);
  return names;
}

type AggregatedBuild = {
  aggregated: Map<string, AggregatedReminder>;
  fromEmail: string;
};

// Builds one AggregatedReminder per owner across the supplied set of rule IDs.
// Pure computation — does not send anything.
async function buildAggregated(rulesToRun: RuleId[]): Promise<AggregatedBuild> {
  const fromEmail = (process.env.NOTIFICATION_FROM_EMAIL ?? "").trim();
  const settings = await readNotificationSettings();

  const [periods, allObjectives, allKrs] = await Promise.all([
    listPeriods(),
    listObjectives({}),
    listKeyResults({})
  ]);
  const activePeriodKeys = new Set(
    periods.filter((p) => p.status === "Active").map((p) => p.periodKey)
  );
  const ownerNames = collectOwnerNames(allObjectives, allKrs);

  const aggregated = new Map<string, AggregatedReminder>();

  for (const ruleId of rulesToRun) {
    const rule = effectiveRule(ruleId, settings.rules[ruleId]);

    const owners = new Set<string>();
    for (const obj of allObjectives) {
      if (!activePeriodKeys.has(obj.periodKey)) continue;
      const email = lowerEmail(obj.ownerEmail);
      if (email) owners.add(email);
    }
    for (const kr of allKrs) {
      if (!activePeriodKeys.has(kr.periodKey)) continue;
      const email = lowerEmail(kr.ownerEmail);
      if (email) owners.add(email);
    }

    for (const email of owners) {
      const content = gatherRuleContent(ruleId, email, allObjectives, allKrs, activePeriodKeys);
      if (content.objectives.length === 0 && content.krs.length === 0) continue;

      let reminder = aggregated.get(email);
      if (!reminder) {
        reminder = { ownerName: ownerNames.get(email) ?? "", sections: [] };
        aggregated.set(email, reminder);
      }
      const section: RuleSection = {
        ruleId,
        ruleLabel: rule.label,
        ruleMessage: rule.message,
        objectives: content.objectives,
        krs: content.krs
      };
      reminder.sections.push(section);
    }
  }

  return { aggregated, fromEmail };
}

function summarizeReminder(reminder: AggregatedReminder): string {
  if (reminder.sections.length === 0) return "no items";
  return reminder.sections.map((s) => s.ruleLabel).join(", ");
}

// Lists who would receive a reminder for the given rules and what each email
// would contain (subject, html, summary). Used by the admin preview UI.
export async function previewReminders(rulesToRun: RuleId[]): Promise<ReminderPreviewResult> {
  const { aggregated } = await buildAggregated(rulesToRun);

  const recipients: ReminderRecipientPreview[] = [];
  for (const [email, reminder] of aggregated) {
    if (!email || !email.includes("@") || reminder.sections.length === 0) continue;
    const { subject, html } = buildAggregatedEmail(email, reminder);
    recipients.push({
      email,
      name: reminder.ownerName || email,
      summary: summarizeReminder(reminder),
      subject,
      html
    });
  }
  recipients.sort((a, b) => a.name.localeCompare(b.name));

  return { rulesIncluded: rulesToRun, recipients };
}

// Computes and sends one aggregated email per owner. When `recipientFilter` is
// provided, only those email addresses are sent to.
export async function runReminders(
  rulesToRun: RuleId[],
  recipientFilter?: string[]
): Promise<ReminderRunResult> {
  const now = new Date();
  const { aggregated, fromEmail } = await buildAggregated(rulesToRun);

  let toSend = aggregated;
  if (recipientFilter) {
    const allowed = new Set(recipientFilter.map((email) => lowerEmail(email)));
    toSend = new Map([...aggregated].filter(([email]) => allowed.has(email)));
  }

  let sendResult: SendRemindersResult | { error: string };
  try {
    sendResult = await sendAggregatedReminders(toSend, fromEmail);
  } catch (err) {
    sendResult = { error: err instanceof Error ? err.message : String(err) };
  }

  return {
    ranAt: now.toISOString(),
    rulesRun: rulesToRun,
    recipients: toSend.size,
    sendResult
  };
}

// Helper used by both routes — reads settings, picks enabled rule IDs.
export async function getEnabledRuleIds(): Promise<RuleId[]> {
  const settings = await readNotificationSettings();
  return RULE_IDS.filter((id) => settings.rules[id]?.enabled);
}

// Records a reminder run in the activity log. Never throws.
export async function logReminderRun(
  userEmail: string,
  routePath: string,
  result: ReminderRunResult
): Promise<void> {
  try {
    await logUserActivity({
      userEmail: userEmail || "scheduler",
      activityName: "Sent reminder emails",
      httpMethod: "POST",
      routePath,
      occurredAt: result.ranAt,
      entityType: "notification",
      detailsJson: JSON.stringify({
        rulesRun: result.rulesRun,
        recipients: result.recipients,
        sendResult: result.sendResult
      })
    });
  } catch {
    // ignore — activity logging is best-effort
  }
}
