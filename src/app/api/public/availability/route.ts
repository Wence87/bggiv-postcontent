import { Product } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBookingWhere, getPostsAvailability } from "@/lib/bookingService";

const BUSINESS_TZ = "Europe/Brussels";
const MAX_ROTATION = 10;
const SPONSORSHIP_MONTH_WINDOW = 12;
const ADS_WEEK_WINDOW = 52;
const POSTS_DAY_WINDOW = 365;

type PublicProduct = "sponsorship" | "ads" | "news" | "promo" | "giveaway";

const VALID_PRODUCTS = new Set<PublicProduct>([
  "sponsorship",
  "ads",
  "news",
  "promo",
  "giveaway",
]);

function badRequest(message: string) {
  return NextResponse.json({ code: "BAD_REQUEST", message }, { status: 400 });
}

function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function parseDateParam(value: string | null, field: string): Date | null {
  if (!value) {
    return null;
  }

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

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getTimeZoneParts(date: Date, timeZone: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }

  return map;
}

function getBusinessCalendarDateUtc(date: Date): Date {
  const parts = getTimeZoneParts(date, BUSINESS_TZ);
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 0, 0, 0, 0));
}

function startOfBusinessMonthUtc(date: Date): Date {
  const day = getBusinessCalendarDateUtc(date);
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1, 0, 0, 0, 0));
}

function startOfBusinessIsoWeekUtc(date: Date): Date {
  const day = getBusinessCalendarDateUtc(date);
  const dayNumber = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - dayNumber);
  return day;
}

function getMonthKeysInRange(start: Date, end: Date, timeZone: string): string[] {
  const startParts = getTimeZoneParts(start, timeZone);
  const endParts = getTimeZoneParts(end, timeZone);

  const startMonthCursor = new Date(
    Date.UTC(Number(startParts.year), Number(startParts.month) - 1, 1, 0, 0, 0, 0)
  );
  const endMonthCursor = new Date(
    Date.UTC(Number(endParts.year), Number(endParts.month) - 1, 1, 0, 0, 0, 0)
  );

  const keys: string[] = [];
  const cursor = new Date(startMonthCursor);

  while (cursor.getTime() <= endMonthCursor.getTime()) {
    const year = cursor.getUTCFullYear();
    const month = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    keys.push(`${year}-${month}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return keys;
}

function getIsoWeekKey(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const dayNumber = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNumber + 3);

  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4, 0, 0, 0, 0));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);

  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / 604800000);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

function getWeekKeysInRange(start: Date, end: Date, timeZone: string): string[] {
  const startParts = getTimeZoneParts(start, timeZone);
  const endParts = getTimeZoneParts(end, timeZone);

  const cursor = new Date(
    Date.UTC(Number(startParts.year), Number(startParts.month) - 1, Number(startParts.day), 0, 0, 0, 0)
  );
  const endDate = new Date(
    Date.UTC(Number(endParts.year), Number(endParts.month) - 1, Number(endParts.day), 0, 0, 0, 0)
  );

  const keys = new Set<string>();

  while (cursor.getTime() <= endDate.getTime()) {
    keys.add(getIsoWeekKey(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate()));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return [...keys].sort();
}

function parseWeekKey(weekKey: string): { year: number; week: number } | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!match) return null;
  return { year: Number(match[1]), week: Number(match[2]) };
}

function compareWeekKeys(left: string, right: string): number {
  const a = parseWeekKey(left);
  const b = parseWeekKey(right);
  if (!a || !b) return left.localeCompare(right);
  if (a.year !== b.year) return a.year - b.year;
  return a.week - b.week;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const rawProduct = searchParams.get("product")?.toLowerCase();
  if (!rawProduct || !VALID_PRODUCTS.has(rawProduct as PublicProduct)) {
    return badRequest("Invalid or missing product");
  }
  const product = rawProduct as PublicProduct;

  const tz = searchParams.get("tz") || BUSINESS_TZ;
  if (!isValidTimeZone(tz)) {
    return badRequest("Invalid timezone");
  }

  let from: Date;
  let to: Date;

  try {
    const parsedFrom = parseDateParam(searchParams.get("from"), "from");
    const parsedTo = parseDateParam(searchParams.get("to"), "to");

    const now = new Date();

    if (product === "sponsorship") {
      const defaultFrom = startOfBusinessMonthUtc(now);
      from = parsedFrom ?? defaultFrom;
      to = parsedTo ?? addMonths(from, SPONSORSHIP_MONTH_WINDOW - 1);
    } else if (product === "ads") {
      const defaultFrom = startOfBusinessIsoWeekUtc(now);
      from = parsedFrom ?? defaultFrom;
      to = parsedTo ?? addDays(from, ADS_WEEK_WINDOW * 7 - 1);
    } else {
      const defaultFrom = getBusinessCalendarDateUtc(now);
      from = parsedFrom ?? defaultFrom;
      to = parsedTo ?? addDays(from, POSTS_DAY_WINDOW - 1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid date input";
    return badRequest(message);
  }

  if (to.getTime() < from.getTime()) {
    return badRequest("to must be greater than or equal to from");
  }

  if (product === "sponsorship") {
    const monthKeys = getMonthKeysInRange(from, to, BUSINESS_TZ);
    const bookings = await prisma.booking.findMany({
      where: {
        AND: [getActiveBookingWhere()],
        product: Product.SPONSORSHIP,
        monthKey: { in: monthKeys },
      },
      select: {
        monthKey: true,
      },
    });

    const monthsTaken = bookings
      .map((booking) => booking.monthKey)
      .filter((value): value is string => Boolean(value))
      .sort();

    return NextResponse.json({
      product,
      tz,
      monthsTaken,
    });
  }

  if (product === "ads") {
    const weekKeys = getWeekKeysInRange(from, to, BUSINESS_TZ);
    const currentWeekKey = getIsoWeekKey(
      Number(getTimeZoneParts(new Date(), BUSINESS_TZ).year),
      Number(getTimeZoneParts(new Date(), BUSINESS_TZ).month),
      Number(getTimeZoneParts(new Date(), BUSINESS_TZ).day)
    );
    const grouped = await prisma.booking.groupBy({
      by: ["weekKey"],
      where: {
        AND: [getActiveBookingWhere()],
        product: Product.ADS,
        weekKey: { in: weekKeys },
      },
      _count: {
        _all: true,
      },
    });

    const takenByWeek = new Map<string, number>();
    for (const row of grouped) {
      if (row.weekKey) {
        takenByWeek.set(row.weekKey, row._count._all);
      }
    }

    const weeks = weekKeys.map((weekKey) => {
      const bookedCount = takenByWeek.get(weekKey) ?? 0;
      const remainingSlots = Math.max(0, MAX_ROTATION - bookedCount);
      const status =
        compareWeekKeys(weekKey, currentWeekKey) <= 0
          ? "LOCKED"
          : remainingSlots === 0
            ? "FULL"
            : "AVAILABLE";

      return {
        weekKey,
        bookedCount,
        remainingSlots,
        status,
      };
    });

    return NextResponse.json({
      product,
      tz,
      maxRotation: MAX_ROTATION,
      currentWeekKey,
      weeks,
    });
  }

  const postsAvailability = await getPostsAvailability(product, from, to);

  return NextResponse.json({
    product,
    tz,
    ...postsAvailability,
  });
}
