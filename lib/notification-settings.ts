import { promises as fs } from "fs";
import path from "path";

export type NotificationSettings = {
  preDeadline: {
    enabled: boolean;
    daysBefore: number;
    progressThreshold: number;
  };
  overdueCheckIn: {
    enabled: boolean;
  };
  weeklyDigest: {
    enabled: boolean;
    dayOfWeek: number;
  };
  atRiskAlert: {
    enabled: boolean;
  };
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  preDeadline: {
    enabled: true,
    daysBefore: 3,
    progressThreshold: 80
  },
  overdueCheckIn: {
    enabled: true
  },
  weeklyDigest: {
    enabled: false,
    dayOfWeek: 1
  },
  atRiskAlert: {
    enabled: true
  }
};

function getSettingsFilePath(): string {
  const dataDir = process.env.OKR_DATA_DIR ?? path.join(process.cwd(), "data");
  return path.join(dataDir, "notification-settings.json");
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function normalize(input: unknown): NotificationSettings {
  const raw = (input ?? {}) as Partial<NotificationSettings>;
  return {
    preDeadline: {
      enabled: Boolean(raw.preDeadline?.enabled ?? DEFAULT_NOTIFICATION_SETTINGS.preDeadline.enabled),
      daysBefore: clampNumber(raw.preDeadline?.daysBefore, 1, 30, DEFAULT_NOTIFICATION_SETTINGS.preDeadline.daysBefore),
      progressThreshold: clampNumber(
        raw.preDeadline?.progressThreshold,
        0,
        100,
        DEFAULT_NOTIFICATION_SETTINGS.preDeadline.progressThreshold
      )
    },
    overdueCheckIn: {
      enabled: Boolean(raw.overdueCheckIn?.enabled ?? DEFAULT_NOTIFICATION_SETTINGS.overdueCheckIn.enabled)
    },
    weeklyDigest: {
      enabled: Boolean(raw.weeklyDigest?.enabled ?? DEFAULT_NOTIFICATION_SETTINGS.weeklyDigest.enabled),
      dayOfWeek: clampNumber(raw.weeklyDigest?.dayOfWeek, 0, 6, DEFAULT_NOTIFICATION_SETTINGS.weeklyDigest.dayOfWeek)
    },
    atRiskAlert: {
      enabled: Boolean(raw.atRiskAlert?.enabled ?? DEFAULT_NOTIFICATION_SETTINGS.atRiskAlert.enabled)
    }
  };
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
