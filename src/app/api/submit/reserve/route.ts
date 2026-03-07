import { NextRequest, NextResponse } from "next/server";
import { allowRateLimited, getClientIp, isAllowedOrigin } from "@/lib/apiSecurity";
import { fetchWPOrderContextByToken } from "@/lib/wpOrderContext";
import { reserveForSubmit } from "@/lib/submitReservationService";

export const runtime = "nodejs";
const BUSINESS_TZ = "Europe/Brussels";

function badRequest(message: string) {
  return NextResponse.json({ code: "BAD_REQUEST", message }, { status: 400 });
}

function apiError(status: number, code: string, message: string) {
  return NextResponse.json({ code, message }, { status });
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
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return map;
}

function currentMonthKeyBrussels(): string {
  const parts = getTimeZoneParts(new Date(), BUSINESS_TZ);
  return `${parts.year}-${parts.month}`;
}

function currentWeekKeyBrussels(): string {
  const parts = getTimeZoneParts(new Date(), BUSINESS_TZ);
  const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 0, 0, 0, 0));
  const dayNumber = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNumber + 3);

  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4, 0, 0, 0, 0));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / 604800000);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

function compareWeekKeys(left: string, right: string): number {
  const parse = (weekKey: string) => {
    const match = /^(\d{4})-W(\d{2})$/.exec(weekKey);
    if (!match) return null;
    return { year: Number(match[1]), week: Number(match[2]) };
  };
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) return left.localeCompare(right);
  if (a.year !== b.year) return a.year - b.year;
  return a.week - b.week;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  if (!isAllowedOrigin(request.headers)) {
    return apiError(403, "FORBIDDEN_ORIGIN", "Origin not allowed");
  }
  if (!allowRateLimited(`submit-reserve:${ip}`, 40, 15 * 60 * 1000)) {
    return apiError(429, "RATE_LIMITED", "Too many requests");
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const token = typeof body.token === "string" ? body.token : null;
  if (!token) {
    return badRequest("Missing token");
  }

  let context;
  try {
    context = await fetchWPOrderContextByToken(token);
  } catch {
    if (!allowRateLimited(`submit-reserve-invalid:${ip}`, 10, 15 * 60 * 1000)) {
      return apiError(429, "RATE_LIMITED", "Too many invalid attempts");
    }
    return apiError(401, "TOKEN_INVALID", "Invalid or expired token");
  }

  try {
    const monthKey = typeof body.monthKey === "string" ? body.monthKey : undefined;
    const weekKey = typeof body.weekKey === "string" ? body.weekKey : undefined;
    const startsAtUtc = typeof body.startsAtUtc === "string" ? body.startsAtUtc : undefined;

    if (context.product.product_type === "sponsorship") {
      if (!monthKey) return badRequest("Missing monthKey");
      if (monthKey <= currentMonthKeyBrussels()) {
        return NextResponse.json({ code: "MONTH_LOCKED" }, { status: 409 });
      }
    }

    if (context.product.product_type === "ads") {
      if (!weekKey) return badRequest("Missing weekKey");
      if (compareWeekKeys(weekKey, currentWeekKeyBrussels()) <= 0) {
        return NextResponse.json({ code: "WEEK_LOCKED" }, { status: 409 });
      }
    }

    const booking = await reserveForSubmit({
      token,
      productType: context.product.product_type,
      monthKey,
      weekKey,
      startsAtUtc,
    });

    return NextResponse.json({
      reservation: {
        id: booking.id,
        status: booking.status,
        monthKey: booking.monthKey,
        weekKey: booking.weekKey,
        startsAtUtc: booking.startsAtUtc?.toISOString() ?? null,
        expiresAt: booking.expiresAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "RESERVATION_FAILED";
    const status =
      code === "MONTH_ALREADY_BOOKED" ||
      code === "ADS_CAPACITY_REACHED" ||
      code === "HOUR_ALREADY_BOOKED" ||
      code === "POST_LEADTIME_LOCKED" ||
      code === "PROMO_DAILY_LIMIT" ||
      code === "GIVEAWAY_DAILY_LIMIT"
        ? 409
        : 400;
    return NextResponse.json({ code }, { status });
  }
}
