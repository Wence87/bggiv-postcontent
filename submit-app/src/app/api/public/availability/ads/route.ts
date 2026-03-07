import { Product } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getActiveBookingWhere } from "@/lib/bookingService";

const BUSINESS_TZ = "Europe/Brussels";
const MAX_ROTATION = 10;
const ADS_WEEK_WINDOW = 52;

type AdsWeekStatus = "available" | "taken" | "locked";

function badRequest(message: string) {
  return NextResponse.json({ code: "BAD_REQUEST", message }, { status: 400 });
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

  const map: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }
  return map;
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

function getWeekKeyForDateInBusinessTz(date: Date): string {
  const parts = getTimeZoneParts(date, BUSINESS_TZ);
  return getIsoWeekKey(Number(parts.year), Number(parts.month), Number(parts.day));
}

function getWeekKeysInRange(start: Date, end: Date): string[] {
  const startParts = getTimeZoneParts(start, BUSINESS_TZ);
  const endParts = getTimeZoneParts(end, BUSINESS_TZ);

  const cursor = new Date(
    Date.UTC(Number(startParts.year), Number(startParts.month) - 1, Number(startParts.day), 0, 0, 0, 0)
  );
  const last = new Date(
    Date.UTC(Number(endParts.year), Number(endParts.month) - 1, Number(endParts.day), 0, 0, 0, 0)
  );

  const keys = new Set<string>();
  while (cursor.getTime() <= last.getTime()) {
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

  let from: Date;
  let to: Date;

  try {
    const now = new Date();
    const parsedFrom = parseDateParam(searchParams.get("from"), "from");
    const parsedTo = parseDateParam(searchParams.get("to"), "to");
    from = parsedFrom ?? now;
    to = parsedTo ?? addDays(from, 7 * ADS_WEEK_WINDOW - 1);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid date input";
    return badRequest(message);
  }

  if (to.getTime() < from.getTime()) {
    return badRequest("to must be greater than or equal to from");
  }

  const weekKeys = getWeekKeysInRange(from, to);

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

  const countByWeek = new Map<string, number>();
  for (const row of grouped) {
    if (row.weekKey) {
      countByWeek.set(row.weekKey, row._count._all);
    }
  }

  const currentWeekKey = getWeekKeyForDateInBusinessTz(new Date());

  const weeks = weekKeys.map((weekKey) => {
    const bookedCount = countByWeek.get(weekKey) ?? 0;
    const remainingSlots = Math.max(0, MAX_ROTATION - bookedCount);

    let status: AdsWeekStatus = "available";
    if (compareWeekKeys(weekKey, currentWeekKey) <= 0) {
      status = "locked";
    } else if (remainingSlots === 0) {
      status = "taken";
    }

    return {
      weekKey,
      status,
      bookedCount,
      remainingSlots,
      totalSlots: MAX_ROTATION,
    };
  });

  return NextResponse.json({
    product: "ads",
    tz: BUSINESS_TZ,
    currentWeekKey,
    weeks,
  });
}
