import { ShiftType } from "@prisma/client";

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

export interface ResolvedShift {
  shiftType: ShiftType;
  shiftDate: Date;
  shiftStart: Date;
  shiftEnd: Date;
  label: string;
}

function taipeiParts(date: Date) {
  const local = new Date(date.getTime() + TAIPEI_OFFSET_MS);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth(),
    day: local.getUTCDate(),
    hour: local.getUTCHours(),
  };
}

/** 將台北時間的 Y/M/D H:M 轉成 UTC Date */
function taipeiToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): Date {
  return new Date(
    Date.UTC(year, month, day, hour, minute, 0, 0) - TAIPEI_OFFSET_MS,
  );
}

function dateOnly(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

export function getShiftLabel(shiftType: ShiftType): string {
  switch (shiftType) {
    case ShiftType.MORNING:
      return "早班";
    case ShiftType.AFTERNOON:
      return "中班";
    case ShiftType.NIGHT:
      return "晚班";
  }
}

export function resolveCurrentShift(now = new Date()): ResolvedShift {
  const { year, month, day, hour } = taipeiParts(now);

  if (hour >= 7 && hour < 15) {
    return {
      shiftType: ShiftType.MORNING,
      shiftDate: dateOnly(year, month, day),
      shiftStart: taipeiToUtc(year, month, day, 7),
      shiftEnd: taipeiToUtc(year, month, day, 15),
      label: "早班",
    };
  }

  if (hour >= 15 && hour < 23) {
    return {
      shiftType: ShiftType.AFTERNOON,
      shiftDate: dateOnly(year, month, day),
      shiftStart: taipeiToUtc(year, month, day, 15),
      shiftEnd: taipeiToUtc(year, month, day, 23),
      label: "中班",
    };
  }

  if (hour >= 23) {
    const next = new Date(Date.UTC(year, month, day + 1));
    return {
      shiftType: ShiftType.NIGHT,
      shiftDate: dateOnly(year, month, day),
      shiftStart: taipeiToUtc(year, month, day, 23),
      shiftEnd: taipeiToUtc(
        next.getUTCFullYear(),
        next.getUTCMonth(),
        next.getUTCDate(),
        7,
      ),
      label: "晚班",
    };
  }

  // 00:00–06:59，屬於前一日 23:00 開始的晚班
  const prev = new Date(Date.UTC(year, month, day - 1));
  return {
    shiftType: ShiftType.NIGHT,
    shiftDate: dateOnly(
      prev.getUTCFullYear(),
      prev.getUTCMonth(),
      prev.getUTCDate(),
    ),
    shiftStart: taipeiToUtc(
      prev.getUTCFullYear(),
      prev.getUTCMonth(),
      prev.getUTCDate(),
      23,
    ),
    shiftEnd: taipeiToUtc(year, month, day, 7),
    label: "晚班",
  };
}

export function formatShiftWindow(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}
