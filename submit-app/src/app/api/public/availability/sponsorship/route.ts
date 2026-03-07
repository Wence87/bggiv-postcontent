import { Product } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getActiveBookingWhere } from "@/lib/bookingService";

const BUSINESS_TZ = "Europe/Brussels";

type SponsorshipStatus = "available" | "taken" | "locked";

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
  });

  const map: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }
  return map;
}

function monthKeyForDate(date: Date): string {
  const parts = getTimeZoneParts(date, BUSINESS_TZ);
  return `${parts.year}-${parts.month}`;
}

function getMonthKeysInRange(start: Date, end: Date): string[] {
  const startParts = getTimeZoneParts(start, BUSINESS_TZ);
  const endParts = getTimeZoneParts(end, BUSINESS_TZ);

  const cursor = new Date(Date.UTC(Number(startParts.year), Number(startParts.month) - 1, 1, 0, 0, 0, 0));
  const last = new Date(Date.UTC(Number(endParts.year), Number(endParts.month) - 1, 1, 0, 0, 0, 0));

  const keys: string[] = [];
  while (cursor.getTime() <= last.getTime()) {
    keys.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return keys;
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
    to = parsedTo ?? addMonths(from, 12);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid date input";
    return badRequest(message);
  }

  if (to.getTime() < from.getTime()) {
    return badRequest("to must be greater than or equal to from");
  }

  const monthKeys = getMonthKeysInRange(from, to);

  const rows = await prisma.booking.findMany({
    where: {
      AND: [getActiveBookingWhere()],
      product: Product.SPONSORSHIP,
      monthKey: { in: monthKeys },
    },
    select: {
      monthKey: true,
    },
  });

  const taken = new Set(
    rows
      .map((row) => row.monthKey)
      .filter((value): value is string => Boolean(value))
  );

  const currentMonthKey = monthKeyForDate(new Date());

  const months = monthKeys.map((monthKey) => {
    let status: SponsorshipStatus = "available";
    if (taken.has(monthKey)) {
      status = "taken";
    } else if (monthKey <= currentMonthKey) {
      status = "locked";
    }

    return { monthKey, status };
  });

  return NextResponse.json({
    product: "sponsorship",
    tz: BUSINESS_TZ,
    months,
  });
}
