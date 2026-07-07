export type AnalyticsPeriod = "daily" | "weekly" | "monthly";

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

function taipeiNowParts() {
  const local = new Date(Date.now() + TAIPEI_OFFSET_MS);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth(),
    day: local.getUTCDate(),
  };
}

function taipeiToUtc(year: number, month: number, day: number, hour = 0): Date {
  return new Date(Date.UTC(year, month, day, hour, 0, 0, 0) - TAIPEI_OFFSET_MS);
}

export function resolveAnalyticsPeriod(period: AnalyticsPeriod) {
  const { year, month, day } = taipeiNowParts();
  const end = new Date();

  let start: Date;
  let label: string;

  switch (period) {
    case "weekly":
      start = taipeiToUtc(year, month, day - 6);
      label = "本週";
      break;
    case "monthly":
      start = taipeiToUtc(year, month, 1);
      label = "本月";
      break;
    case "daily":
    default:
      start = taipeiToUtc(year, month, day);
      label = "今日";
      break;
  }

  return { start, end, label, period };
}

export function parseAnalyticsPeriod(value: unknown): AnalyticsPeriod {
  if (value === "weekly" || value === "monthly" || value === "daily") {
    return value;
  }
  return "daily";
}

/** 將日期格式化為台北時區 YYYY-MM-DD（趨勢圖 X 軸） */
export function toTaipeiDateKey(date: Date): string {
  const local = new Date(date.getTime() + TAIPEI_OFFSET_MS);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, "0");
  const d = String(local.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
