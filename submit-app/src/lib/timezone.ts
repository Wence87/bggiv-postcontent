export const REFERENCE_TIMEZONE = "Europe/Brussels";

export const COMMON_TIMEZONES = [
  "Europe/Brussels",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Zurich",
  "Europe/Stockholm",
  "Europe/Warsaw",
  "Europe/Athens",
  "Europe/Istanbul",
  "Europe/Moscow",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "America/Bogota",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Australia/Sydney",
  "Pacific/Auckland",
] as const;

export type CommonTimeZone = (typeof COMMON_TIMEZONES)[number];
export type TimeZoneOption = {
  tz: CommonTimeZone;
  country: string;
  city: string;
};

const TIMEZONE_METADATA: Record<CommonTimeZone, { country: string; city: string }> = {
  "Europe/Brussels": { country: "Belgium", city: "Brussels" },
  "Europe/London": { country: "United Kingdom", city: "London" },
  "Europe/Paris": { country: "France", city: "Paris" },
  "Europe/Berlin": { country: "Germany", city: "Berlin" },
  "Europe/Madrid": { country: "Spain", city: "Madrid" },
  "Europe/Rome": { country: "Italy", city: "Rome" },
  "Europe/Amsterdam": { country: "Netherlands", city: "Amsterdam" },
  "Europe/Zurich": { country: "Switzerland", city: "Zurich" },
  "Europe/Stockholm": { country: "Sweden", city: "Stockholm" },
  "Europe/Warsaw": { country: "Poland", city: "Warsaw" },
  "Europe/Athens": { country: "Greece", city: "Athens" },
  "Europe/Istanbul": { country: "Turkey", city: "Istanbul" },
  "Europe/Moscow": { country: "Russia", city: "Moscow" },
  "America/New_York": { country: "United States", city: "New York" },
  "America/Chicago": { country: "United States", city: "Chicago" },
  "America/Denver": { country: "United States", city: "Denver" },
  "America/Los_Angeles": { country: "United States", city: "Los Angeles" },
  "America/Toronto": { country: "Canada", city: "Toronto" },
  "America/Mexico_City": { country: "Mexico", city: "Mexico City" },
  "America/Sao_Paulo": { country: "Brazil", city: "Sao Paulo" },
  "America/Bogota": { country: "Colombia", city: "Bogota" },
  "Asia/Dubai": { country: "United Arab Emirates", city: "Dubai" },
  "Asia/Kolkata": { country: "India", city: "Kolkata" },
  "Asia/Bangkok": { country: "Thailand", city: "Bangkok" },
  "Asia/Singapore": { country: "Singapore", city: "Singapore" },
  "Asia/Tokyo": { country: "Japan", city: "Tokyo" },
  "Asia/Seoul": { country: "South Korea", city: "Seoul" },
  "Asia/Shanghai": { country: "China", city: "Shanghai" },
  "Australia/Sydney": { country: "Australia", city: "Sydney" },
  "Pacific/Auckland": { country: "New Zealand", city: "Auckland" },
};

function getTimeZoneParts(date: Date, timeZone: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const map: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }
  return map;
}

function getOffsetMsForTimeZone(date: Date, timeZone: string): number {
  const parts = getTimeZoneParts(date, timeZone);
  const zonedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return zonedAsUtc - date.getTime();
}

export function resolveTimeZoneDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let utc = new Date(utcGuess - getOffsetMsForTimeZone(new Date(utcGuess), timeZone));
  utc = new Date(utcGuess - getOffsetMsForTimeZone(utc, timeZone));
  return utc;
}

export function formatInTimeZone(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function getDateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = getTimeZoneParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getDayShiftFromReference(
  date: Date,
  targetTimeZone: string,
  referenceTimeZone: string = REFERENCE_TIMEZONE
): number {
  const referenceDateKey = getDateKeyInTimeZone(date, referenceTimeZone);
  const targetDateKey = getDateKeyInTimeZone(date, targetTimeZone);

  const [referenceYear, referenceMonth, referenceDay] = referenceDateKey
    .split("-")
    .map((part) => Number(part));
  const [targetYear, targetMonth, targetDay] = targetDateKey
    .split("-")
    .map((part) => Number(part));

  const referenceUtcDay = Date.UTC(referenceYear, referenceMonth - 1, referenceDay);
  const targetUtcDay = Date.UTC(targetYear, targetMonth - 1, targetDay);
  return Math.round((targetUtcDay - referenceUtcDay) / 86400000);
}

export function getDayShiftLabel(dayShift: number): string | null {
  if (dayShift === 1) return "+1 day";
  if (dayShift === -1) return "-1 day";
  if (dayShift > 1) return `+${dayShift} days`;
  if (dayShift < -1) return `-${Math.abs(dayShift)} days`;
  return null;
}

export function getUtcOffsetLabel(tz: string, referenceDate: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "shortOffset",
  }).formatToParts(referenceDate);

  const zonePart = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(zonePart);
  if (!match) {
    return "UTC+00:00";
  }

  const sign = match[1];
  const hours = match[2].padStart(2, "0");
  const minutes = (match[3] ?? "00").padStart(2, "0");
  return `UTC${sign}${hours}:${minutes}`;
}

export function getDefaultUserTz(): string | null {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!resolved) return null;
    return COMMON_TIMEZONES.includes(resolved as CommonTimeZone) ? resolved : null;
  } catch {
    return null;
  }
}

export function formatTimeZoneLabel(tz: string): string {
  const city = tz.includes("/") ? tz.split("/").slice(1).join("/") : tz;
  return city.replace(/_/g, " ");
}

export function getTimeZoneOptions(referenceDate: Date = new Date()): TimeZoneOption[] {
  return COMMON_TIMEZONES.map((tz) => ({
    tz,
    country: TIMEZONE_METADATA[tz].country,
    city: TIMEZONE_METADATA[tz].city,
  })).sort((a, b) => {
    const countryCompare = a.country.localeCompare(b.country);
    if (countryCompare !== 0) return countryCompare;
    return a.city.localeCompare(b.city);
  });
}
