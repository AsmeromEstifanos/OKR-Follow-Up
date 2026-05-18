import { promises as fs } from "fs";
import path from "path";
import { RULE_DEFINITIONS, RULE_IDS, type RuleId } from "@/lib/notification-rules";

export type RuleSettings = {
  enabled: boolean;
  hour: number;
  minute: number;
  dayOfWeek: number;  // only meaningful for weekly rules
  dayOfMonth: number; // only meaningful for monthly rules
  message: string;
};

export type NotificationSettings = {
  rules: Record<RuleId, RuleSettings>;
};

function defaultRuleSettings(id: RuleId): RuleSettings {
  const def = RULE_DEFINITIONS[id];
  return {
    enabled: false,
    hour: "hour" in def.schedule ? def.schedule.hour : 9,
    minute: "minute" in def.schedule ? def.schedule.minute : 0,
    dayOfWeek: def.schedule.kind === "weekly" ? def.schedule.dayOfWeek : 1,
    dayOfMonth: def.schedule.kind === "monthly" ? def.schedule.dayOfMonth : 1,
    message: def.message
  };
}

function defaultRules(): Record<RuleId, RuleSettings> {
  return RULE_IDS.reduce(
    (acc, id) => {
      acc[id] = defaultRuleSettings(id);
      return acc;
    },
    {} as Record<RuleId, RuleSettings>
  );
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  rules: defaultRules()
};

function getSettingsFilePath(): string {
  const dataDir = process.env.OKR_DATA_DIR ?? path.join(process.cwd(), "data");
  return path.join(dataDir, "notification-settings.json");
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function normalize(input: unknown): NotificationSettings {
  const raw = (input ?? {}) as Partial<NotificationSettings> & Record<string, unknown>;
  const rawRules = (raw.rules ?? {}) as Partial<Record<RuleId, Partial<RuleSettings>>>;

  const rules = defaultRules();
  for (const id of RULE_IDS) {
    const base = rules[id];
    const entry = rawRules[id];
    if (!entry || typeof entry !== "object") {
      continue;
    }
    rules[id] = {
      enabled: typeof entry.enabled === "boolean" ? entry.enabled : base.enabled,
      hour: clampInt(entry.hour, 0, 23, base.hour),
      minute: clampInt(entry.minute, 0, 59, base.minute),
      dayOfWeek: clampInt(entry.dayOfWeek, 0, 6, base.dayOfWeek),
      dayOfMonth: clampInt(entry.dayOfMonth, 1, 31, base.dayOfMonth),
      message: typeof entry.message === "string" && entry.message.trim() ? entry.message : base.message
    };
  }

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
