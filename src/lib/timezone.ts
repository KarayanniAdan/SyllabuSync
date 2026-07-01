export const DEFAULT_ACADEMIC_TIMEZONE = "Asia/Jerusalem";

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function hasExplicitTimezone(value: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
}

function stripTrailingTimezone(value: string): string {
  return value.replace(/(?:Z|[+-]\d{2}:?\d{2})$/i, "");
}

function sourceMentionsExplicitTimezone(sourceText: string): boolean {
  return /(\b(?:utc|gmt)\b|\b(?:eet|eest|cet|cest|pst|pdt|mst|mdt|cst|cdt|est|edt)\b|asia\/jerusalem|utc\s*[+-]\s*\d{1,2}|gmt\s*[+-]\s*\d{1,2}|[+-]\d{2}:?\d{2}\b)/i.test(
    sourceText,
  );
}

function extractExplicitClockFromSource(sourceText: string): { hour: number; minute: number } | null {
  const amPmMatch = sourceText.match(/\b(1[0-2]|0?[1-9]):([0-5]\d)\s*(am|pm)\b/i);
  if (amPmMatch) {
    const rawHour = Number(amPmMatch[1]);
    const minute = Number(amPmMatch[2]);
    const meridiem = amPmMatch[3].toLowerCase();
    const hour = meridiem === "pm" ? (rawHour % 12) + 12 : rawHour % 12;
    return { hour, minute };
  }

  const twentyFourHourMatch = sourceText.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (!twentyFourHourMatch) return null;

  return {
    hour: Number(twentyFourHourMatch[1]),
    minute: Number(twentyFourHourMatch[2]),
  };
}

function getDatePartsInTimezone(date: Date, timeZone: string): { year: number; month: number; day: number } | null {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const valueByType: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") {
      valueByType[part.type] = part.value;
    }
  }

  const year = Number(valueByType.year);
  const month = Number(valueByType.month);
  const day = Number(valueByType.day);

  if (!year || !month || !day) return null;
  return { year, month, day };
}

function parseIsoLikeLocalDateTime(value: string): DateTimeParts | null {
  const match = value
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/);

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4] ?? "0");
  const minute = Number(match[5] ?? "0");
  const second = Number(match[6] ?? "0");

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second)
  ) {
    return null;
  }

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  if (second < 0 || second > 59) return null;

  return { year, month, day, hour, minute, second };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const map: Record<string, number> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") {
      map[part.type] = Number(part.value);
    }
  }

  const asUtcMs = Date.UTC(
    map.year,
    (map.month ?? 1) - 1,
    map.day ?? 1,
    map.hour ?? 0,
    map.minute ?? 0,
    map.second ?? 0,
  );

  return asUtcMs - date.getTime();
}

function zonedDateTimePartsToUtcDate(parts: DateTimeParts, timeZone: string): Date {
  const targetUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  // Iterate because the timezone offset can vary by date (DST boundaries).
  let candidateMs = targetUtcMs;
  for (let i = 0; i < 4; i += 1) {
    const offsetMs = getTimeZoneOffsetMs(new Date(candidateMs), timeZone);
    const nextCandidateMs = targetUtcMs - offsetMs;
    if (nextCandidateMs === candidateMs) break;
    candidateMs = nextCandidateMs;
  }

  return new Date(candidateMs);
}

export function normalizeDeadlineDueAt(dueAt: string): string {
  const value = dueAt.trim();
  if (!value) return "";

  if (hasExplicitTimezone(value)) {
    const explicit = new Date(value);
    return Number.isNaN(explicit.getTime()) ? "" : explicit.toISOString();
  }

  const localParts = parseIsoLikeLocalDateTime(value);
  if (localParts) {
    return zonedDateTimePartsToUtcDate(localParts, DEFAULT_ACADEMIC_TIMEZONE).toISOString();
  }

  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? "" : fallback.toISOString();
}

export function normalizeDeadlineDueAtFromSource(dueAt: string, sourceText: string): string {
  const value = dueAt.trim();
  if (!value) return "";

  const sourceHasExplicitTimezone = sourceMentionsExplicitTimezone(sourceText);
  const sourceClock = extractExplicitClockFromSource(sourceText);

  let normalized = "";

  if (hasExplicitTimezone(value) && !sourceHasExplicitTimezone) {
    normalized = normalizeDeadlineDueAt(stripTrailingTimezone(value));
  } else {
    normalized = normalizeDeadlineDueAt(value);
  }

  if (!normalized) return "";

  // If source includes an explicit clock time but no explicit timezone, trust the clock as Israel local time.
  if (!sourceHasExplicitTimezone && sourceClock) {
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) {
      const dateParts = getDatePartsInTimezone(parsed, DEFAULT_ACADEMIC_TIMEZONE);
      if (dateParts) {
        return zonedDateTimePartsToUtcDate(
          {
            year: dateParts.year,
            month: dateParts.month,
            day: dateParts.day,
            hour: sourceClock.hour,
            minute: sourceClock.minute,
            second: 0,
          },
          DEFAULT_ACADEMIC_TIMEZONE,
        ).toISOString();
      }
    }
  }

  return normalized;
}

export function parseDeadlineDueAt(dueAt: string): Date | null {
  const normalized = normalizeDeadlineDueAt(dueAt);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getDeadlineTimestamp(dueAt: string): number | null {
  const parsed = parseDeadlineDueAt(dueAt);
  return parsed ? parsed.getTime() : null;
}

export function getWeekdayInAcademicTimezone(dueAt: string): number | null {
  const parsed = parseDeadlineDueAt(dueAt);
  if (!parsed) return null;

  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: DEFAULT_ACADEMIC_TIMEZONE,
    weekday: "short",
  }).format(parsed);

  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return map[weekday] ?? null;
}

export function formatDueAtForDisplay(dueAt: string): string {
  const parsed = parseDeadlineDueAt(dueAt);
  if (!parsed) return "";

  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: DEFAULT_ACADEMIC_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);

  const timeLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: DEFAULT_ACADEMIC_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);

  return `${dateLabel} at ${timeLabel}`;
}

export function formatDueAtDisplayDate(dueAt: string): string {
  const parsed = parseDeadlineDueAt(dueAt);
  if (!parsed) return "TBD";

  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: DEFAULT_ACADEMIC_TIMEZONE,
    weekday: "short",
  }).format(parsed);
  const month = new Intl.DateTimeFormat("en-US", {
    timeZone: DEFAULT_ACADEMIC_TIMEZONE,
    month: "short",
  }).format(parsed);
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: DEFAULT_ACADEMIC_TIMEZONE,
    day: "numeric",
  }).format(parsed);
  const year = new Intl.DateTimeFormat("en-US", {
    timeZone: DEFAULT_ACADEMIC_TIMEZONE,
    year: "numeric",
  }).format(parsed);
  const hh = new Intl.DateTimeFormat("en-US", {
    timeZone: DEFAULT_ACADEMIC_TIMEZONE,
    hour: "2-digit",
    hour12: false,
  }).format(parsed);
  const mm = new Intl.DateTimeFormat("en-US", {
    timeZone: DEFAULT_ACADEMIC_TIMEZONE,
    minute: "2-digit",
  }).format(parsed);

  return `${weekday}, ${month} ${day}, ${year} · ${hh}:${mm}`;
}

export function getAcademicNowDateTimeParts(now: Date = new Date()): DateTimeParts & { weekday: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: DEFAULT_ACADEMIC_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });

  const valueByType: Record<string, string> = {};
  for (const part of formatter.formatToParts(now)) {
    if (part.type !== "literal") {
      valueByType[part.type] = part.value;
    }
  }

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: Number(valueByType.year),
    month: Number(valueByType.month),
    day: Number(valueByType.day),
    hour: Number(valueByType.hour),
    minute: Number(valueByType.minute),
    second: Number(valueByType.second),
    weekday: weekdayMap[valueByType.weekday] ?? 0,
  };
}

export function buildAcademicDueAtIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string {
  return zonedDateTimePartsToUtcDate(
    {
      year,
      month,
      day,
      hour,
      minute,
      second: 0,
    },
    DEFAULT_ACADEMIC_TIMEZONE,
  ).toISOString();
}