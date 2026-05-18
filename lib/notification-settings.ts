import { promises as fs } from "fs";
import path from "path";
import { RULE_IDS, type RuleId } from "@/lib/notification-rules";

export type NotificationSettings = {
  rules: Record<RuleId, { enabled: boolean }>;
};

function defaultRules(): Record<RuleId, { enabled: boolean }> {
  // Default everything to disabled — admin opts each rule in deliberately.
  return RULE_IDS.reduce(
    (acc, id) => {
      acc[id] = { enabled: false };
      return acc;
    },
    {} as Record<RuleId, { enabled: boolean }>
  );
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  rules: defaultRules()
};

function getSettingsFilePath(): string {
  const dataDir = process.env.OKR_DATA_DIR ?? path.join(process.cwd(), "data");
  return path.join(dataDir, "notification-settings.json");
}

function normalize(input: unknown): NotificationSettings {
  const raw = (input ?? {}) as Partial<NotificationSettings> & Record<string, unknown>;
  const rawRules = (raw.rules ?? {}) as Partial<Record<RuleId, { enabled?: unknown }>>;

  const rules = defaultRules();
  for (const id of RULE_IDS) {
    const entry = rawRules[id];
    if (entry && typeof entry === "object" && "enabled" in entry) {
      rules[id] = { enabled: Boolean(entry.enabled) };
    }
  }

  // Tolerate the older settings shape (preDeadline/overdueCheckIn/atRiskAlert/
  // weeklyDigest, or fromEmail) by ignoring it — values aren't migrated, the
  // admin just re-opts into the new rule list once.

  return { rules };
}

export async function readNotificationSettings(): Promise<NotificationSettings> {
  try {
    const text = await fs.readFile(getSettingsFilePath(), "utf-8");
    return normalize(JSON.parse(text));
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

export async function writeNotificationSettings(input: unknown): Promise<NotificationSettings> {
  const normalized = normalize(input);
  const filePath = getSettingsFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(normalized, null, 2), "utf-8");
  return normalized;
}
