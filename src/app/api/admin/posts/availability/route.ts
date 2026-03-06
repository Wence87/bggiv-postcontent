import { Product } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBookingWhere } from "@/lib/bookingService";

const BUSINESS_TZ = "Europe/Brussels";
const POSTS_LEAD_DAYS = 2;
const POSTS_PRODUCTS = [Product.NEWS, Product.PROMO, Product.GIVEAWAY] as const;

type PostsViewProduct = "news" | "promo" | "giveaway";
type DayStatus = "LOCKED" | "AVAILABLE" | "TAKEN";
type HourStatus = "LOCKED" | "AVAILABLE" | "TAKEN";

function unauthorized() {
  return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ code: "BAD_REQUEST", message }, { status: 400 });
}

function getProvidedAdminToken(request: NextRequest): string | null {
  const headerToken = request.headers.get("x-admin-token");
  if (headerToken) return headerToken;

  const authHeader = request.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return request.nextUrl.searchParams.get("token");
}

function isAdminAuthorized(request: NextRequest): boolean {
  const expected = process.env.ADMIN_TOKEN;
  const provided = getProvidedAdminToken(request);
  return Boolean(expected) && provided === expected;
}

function parseDateParam(value: string | null, field: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${field} date`);
  }
  return parsed;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

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

function resolveZonedMidnightToUtc(year: number, month: number, day: number, timeZone: string): Date {
  const utcMidnightGuess = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  let utc = new Date(utcMidnightGuess - getOffsetMsForTimeZone(new Date(utcMidnightGuess), timeZone));
  utc = new Date(utcMidnightGuess - getOffsetMsForTimeZone(utc, timeZone));
  return utc;
}

function getDateKeyInZone(date: Date, timeZone: string): string {
  const parts = getTimeZoneParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  base.setUTCDate(base.getUTCDate() + days);
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(base.getUTCDate()).padStart(2, "0")}`;
}

function enumerateDateKeys(startDateKey: string, endDateKey: string): string[] {
  const out: string[] = [];
  let cursor = startDateKey;
  while (cursor <= endDateKey) {
    out.push(cursor);
    cursor = addDaysToDateKey(cursor, 1);
  }
  return out;
}

function getUtcRangeForDateKeys(startDateKey: string, endDateKey: string): { start: Date; endExclusive: Date } {
  const [startYear, startMonth, startDay] = startDateKey.split("-").map(Number);
  const start = resolveZonedMidnightToUtc(startYear, startMonth, startDay, BUSINESS_TZ);
  const nextDateKey = addDaysToDateKey(endDateKey, 1);
  const [endYear, endMonth, endDay] = nextDateKey.split("-").map(Number);
  const endExclusive = resolveZonedMidnightToUtc(endYear, endMonth, endDay, BUSINESS_TZ);
  return { start, endExclusive };
}

function getValidProduct(value: string | null): PostsViewProduct {
  if (value === "news" || value === "promo" || value === "giveaway") {
    return value;
  }
  return "news";
}

function buildEmptyHourStatus(fill: HourStatus): Record<string, HourStatus> {
  const map: Record<string, HourStatus> = {};
  for (let hour = 0; hour < 24; hour += 1) {
    map[`${String(hour).padStart(2, "0")}:00`] = fill;
  }
  return map;
}

export async function GET(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return unauthorized();
  }

  const params = request.nextUrl.searchParams;
  const product = getValidProduct(params.get("product")?.toLowerCase() ?? null);

  let from: Date;
  let to: Date;
  try {
    from = parseDateParam(params.get("from"), "from") ?? new Date();
    to = parseDateParam(params.get("to"), "to") ?? addMonths(from, 3);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid date input";
    return badRequest(message);
  }

  if (to.getTime() < from.getTime()) {
    return badRequest("to must be greater than or equal to from");
  }

  const fromDateKey = getDateKeyInZone(from, BUSINESS_TZ);
  const toDateKey = getDateKeyInZone(to, BUSINESS_TZ);
  const todayDateKey = getDateKeyInZone(new Date(), BUSINESS_TZ);
  const leadTimeLockedUntil = addDaysToDateKey(todayDateKey, POSTS_LEAD_DAYS);
  const dateKeys = enumerateDateKeys(fromDateKey, toDateKey);
  const { start, endExclusive } = getUtcRangeForDateKeys(fromDateKey, toDateKey);

  const bookings = await prisma.booking.findMany({
    where: {
      AND: [getActiveBookingWhere()],
      product: { in: [...POSTS_PRODUCTS] },
      startsAtUtc: {
        gte: start,
        lt: endExclusive,
      },
    },
    select: {
      startsAtUtc: true,
      product: true,
    },
  });

  const takenByDay = new Map<string, Set<string>>();
  for (const booking of bookings) {
    if (!booking.startsAtUtc) continue;
    const parts = getTimeZoneParts(booking.startsAtUtc, BUSINESS_TZ);
    const dayKey = `${parts.year}-${parts.month}-${parts.day}`;
    const hourKey = `${parts.hour}:00`;
    if (!takenByDay.has(dayKey)) {
      takenByDay.set(dayKey, new Set<string>());
    }
    takenByDay.get(dayKey)!.add(hourKey);
  }

  const days = dateKeys.map((dateKey) => {
    const takenHours = takenByDay.get(dateKey) ?? new Set<string>();
    const hasAnyPostThisDay = takenHours.size > 0;
    const isPastOrLeadLocked = dateKey <= leadTimeLockedUntil;

    const hourStatus = buildEmptyHourStatus("AVAILABLE");
    for (let hour = 0; hour < 24; hour += 1) {
      const hourKey = `${String(hour).padStart(2, "0")}:00`;
      if (takenHours.has(hourKey)) {
        hourStatus[hourKey] = "TAKEN";
      } else if (isPastOrLeadLocked) {
        hourStatus[hourKey] = "LOCKED";
      } else if (product !== "news" && hasAnyPostThisDay) {
        hourStatus[hourKey] = "TAKEN";
      } else {
        hourStatus[hourKey] = "AVAILABLE";
      }
    }

    let dayStatus: DayStatus = "AVAILABLE";
    let takenReason: "PAST" | "LEADTIME" | "BOOKED_SLOT" | "BOOKED_DAY" | undefined;

    if (isPastOrLeadLocked) {
      if (hasAnyPostThisDay) {
        dayStatus = "TAKEN";
        takenReason = "BOOKED_SLOT";
      } else {
        dayStatus = "LOCKED";
        takenReason = dateKey < todayDateKey ? "PAST" : "LEADTIME";
      }
    } else if (product !== "news") {
      if (hasAnyPostThisDay) {
        dayStatus = "TAKEN";
        takenReason = "BOOKED_DAY";
      } else {
        dayStatus = "AVAILABLE";
      }
    } else {
      const allTaken = Object.values(hourStatus).every((status) => status === "TAKEN");
      if (allTaken) {
        dayStatus = "TAKEN";
        takenReason = "BOOKED_SLOT";
      } else {
        dayStatus = "AVAILABLE";
      }
    }

    return {
      dateKey,
      dayStatus,
      hourStatus,
      takenReason,
    };
  });

  return NextResponse.json({
    product,
    tz: BUSINESS_TZ,
    leadTimeDays: POSTS_LEAD_DAYS,
    leadTimeLockedUntil,
    days,
  });
}
