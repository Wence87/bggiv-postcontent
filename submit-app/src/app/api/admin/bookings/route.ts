import { BookingStatus, Prisma, Product } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  createBooking,
  getActiveBookingWhere,
  type BookingCreateErrorCode,
} from "@/lib/bookingService";
import { prisma } from "@/lib/prisma";

const BUSINESS_TZ = "Europe/Brussels";

const BOOKING_ERROR_CODES: Set<BookingCreateErrorCode> = new Set([
  "INVALID_PRODUCT",
  "INVALID_DATETIME",
  "MONTH_KEY_REQUIRED",
  "MONTH_ALREADY_BOOKED",
  "WEEK_KEY_REQUIRED",
  "ADS_CAPACITY_REACHED",
  "STARTS_AT_REQUIRED",
  "STARTS_AT_MUST_BE_FULL_HOUR",
  "HOUR_ALREADY_BOOKED",
  "POST_LEADTIME_LOCKED",
  "DAY_ALREADY_HAS_POST",
  "PROMO_DAILY_LIMIT",
  "GIVEAWAY_DAILY_LIMIT",
]);

type GroupedBookingItem = {
  key: string;
  groupId: string | null;
  product: Product;
  slotLabel: string;
  companyName: string;
  status: BookingStatus;
  orderReference: string;
  bookingIds: string[];
  createdAt: string;
};

function unauthorized() {
  return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ code: "BAD_REQUEST", message }, { status: 400 });
}

function getProvidedAdminToken(request: NextRequest): string | null {
  const headerToken = request.headers.get("x-admin-token");
  if (headerToken) {
    return headerToken;
  }

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
    hour: "2-digit",
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

function getWeekKeyFromDate(date: Date, timeZone: string): string {
  const parts = getTimeZoneParts(date, timeZone);
  return getIsoWeekKey(Number(parts.year), Number(parts.month), Number(parts.day));
}

function getMonthKeyFromDate(date: Date, timeZone: string): string {
  const parts = getTimeZoneParts(date, timeZone);
  return `${parts.year}-${parts.month}`;
}

function formatMonthRange(monthKeys: string[]): string {
  const sorted = [...monthKeys].sort();
  if (sorted.length === 0) return "-";
  if (sorted.length === 1) return sorted[0];
  return `${sorted[0]} \u2192 ${sorted[sorted.length - 1]} (${sorted.length} months)`;
}

function formatWeekRange(weekKeys: string[]): string {
  const sorted = [...weekKeys].sort();
  if (sorted.length === 0) return "-";
  if (sorted.length === 1) return sorted[0];
  return `${sorted[0]} \u2192 ${sorted[sorted.length - 1]} (${sorted.length} weeks)`;
}

function formatPostSlotLabel(startsAtUtcValues: string[]): string {
  const sorted = [...startsAtUtcValues].sort();
  if (sorted.length === 0) {
    return "-";
  }

  const byDay = new Map<string, string[]>();
  for (const startsAtUtc of sorted) {
    const date = new Date(startsAtUtc);
    const parts = getTimeZoneParts(date, BUSINESS_TZ);
    const dayKey = `${parts.year}-${parts.month}-${parts.day}`;
    const hourLabel = `${parts.hour}:00`;
    if (!byDay.has(dayKey)) {
      byDay.set(dayKey, []);
    }
    byDay.get(dayKey)!.push(hourLabel);
  }

  const days = Array.from(byDay.keys()).sort();
  if (days.length === 1) {
    const day = days[0];
    const hours = [...new Set(byDay.get(day) ?? [])];
    if (hours.length <= 4) {
      return `${day} (${hours.join(", ")})`;
    }
    return `${day} (${hours.length} slots)`;
  }

  return `${days[0]} \u2192 ${days[days.length - 1]} (${sorted.length} slots)`;
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

function isLockedWeek(weekKey: string, currentWeekKey: string): boolean {
  return compareWeekKeys(weekKey, currentWeekKey) <= 0;
}

function parseMonthKey(monthKey: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

function compareMonthKeys(left: string, right: string): number {
  const a = parseMonthKey(left);
  const b = parseMonthKey(right);
  if (!a || !b) return left.localeCompare(right);
  if (a.year !== b.year) return a.year - b.year;
  return a.month - b.month;
}

function addMonthsToMonthKey(monthKey: string, months: number): string | null {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return null;
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, 1, 0, 0, 0, 0));
  date.setUTCMonth(date.getUTCMonth() + months);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function enumerateMonthRange(startMonthKey: string, endMonthKey: string): string[] {
  const start = compareMonthKeys(startMonthKey, endMonthKey) <= 0 ? startMonthKey : endMonthKey;
  const end = compareMonthKeys(startMonthKey, endMonthKey) <= 0 ? endMonthKey : startMonthKey;
  const items: string[] = [];
  let cursor = start;
  while (compareMonthKeys(cursor, end) <= 0) {
    items.push(cursor);
    const next = addMonthsToMonthKey(cursor, 1);
    if (!next) break;
    cursor = next;
  }
  return items;
}

function normalizeSponsorshipMonths(input: {
  startMonthKey?: string;
  endMonthKey?: string;
  monthsCount?: number;
  monthKeys?: string[];
}): { monthKeys: string[]; startMonthKey: string; endMonthKey: string; monthsCount: number } {
  if (input.startMonthKey && input.monthsCount && input.monthsCount > 0) {
    const monthKeys: string[] = [];
    for (let i = 0; i < input.monthsCount; i += 1) {
      const key = addMonthsToMonthKey(input.startMonthKey, i);
      if (!key) throw new Error("Invalid startMonthKey");
      monthKeys.push(key);
    }
    return {
      monthKeys,
      startMonthKey: monthKeys[0],
      endMonthKey: monthKeys[monthKeys.length - 1],
      monthsCount: monthKeys.length,
    };
  }

  if (input.startMonthKey && input.endMonthKey) {
    const monthKeys = enumerateMonthRange(input.startMonthKey, input.endMonthKey);
    if (monthKeys.length === 0) throw new Error("Invalid sponsorship range");
    return {
      monthKeys,
      startMonthKey: monthKeys[0],
      endMonthKey: monthKeys[monthKeys.length - 1],
      monthsCount: monthKeys.length,
    };
  }

  if (input.monthKeys && input.monthKeys.length > 0) {
    const sorted = [...new Set(input.monthKeys)].sort(compareMonthKeys);
    for (let i = 1; i < sorted.length; i += 1) {
      const expected = addMonthsToMonthKey(sorted[i - 1], 1);
      if (!expected || expected !== sorted[i]) {
        throw new Error("MONTH_RANGE_NOT_CONTIGUOUS");
      }
    }
    return {
      monthKeys: sorted,
      startMonthKey: sorted[0],
      endMonthKey: sorted[sorted.length - 1],
      monthsCount: sorted.length,
    };
  }

  throw new Error("SPONSORSHIP_RANGE_REQUIRED");
}

function parseCreateBody(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid JSON body");
  }

  const body = payload as Record<string, unknown>;

  if (typeof body.product !== "string" || !(body.product in Product)) {
    throw new Error("Invalid product");
  }
  if (typeof body.companyName !== "string" || !body.companyName.trim()) {
    throw new Error("companyName is required");
  }
  if (typeof body.customerEmail !== "string" || !body.customerEmail.trim()) {
    throw new Error("customerEmail is required");
  }
  const rawOrderReference = typeof body.orderReference === "string" ? body.orderReference : body.orderRef;
  if (typeof rawOrderReference !== "string" || !rawOrderReference.trim()) {
    throw new Error("orderRef is required");
  }

  if (body.monthKey != null && typeof body.monthKey !== "string") {
    throw new Error("monthKey must be a string");
  }
  if (body.weekKey != null && typeof body.weekKey !== "string") {
    throw new Error("weekKey must be a string");
  }
  if (body.startsAtUtc != null && typeof body.startsAtUtc !== "string") {
    throw new Error("startsAtUtc must be a string");
  }
  if (
    body.startsAtUtcValues != null &&
    (!Array.isArray(body.startsAtUtcValues) || body.startsAtUtcValues.some((v) => typeof v !== "string"))
  ) {
    throw new Error("startsAtUtcValues must be an array of strings");
  }

  if (body.monthKeys != null && (!Array.isArray(body.monthKeys) || body.monthKeys.some((v) => typeof v !== "string"))) {
    throw new Error("monthKeys must be an array of strings");
  }
  if (body.startMonthKey != null && typeof body.startMonthKey !== "string") {
    throw new Error("startMonthKey must be a string");
  }
  if (body.endMonthKey != null && typeof body.endMonthKey !== "string") {
    throw new Error("endMonthKey must be a string");
  }
  if (body.monthsCount != null && (typeof body.monthsCount !== "number" || !Number.isInteger(body.monthsCount) || body.monthsCount < 1 || body.monthsCount > 12)) {
    throw new Error("monthsCount must be an integer between 1 and 12");
  }
  if (body.weekKeys != null && (!Array.isArray(body.weekKeys) || body.weekKeys.some((v) => typeof v !== "string"))) {
    throw new Error("weekKeys must be an array of strings");
  }

  return {
    product: body.product as Product,
    groupId: typeof body.groupId === "string" ? body.groupId.trim() : undefined,
    monthKey: typeof body.monthKey === "string" ? body.monthKey.trim() : undefined,
    monthKeys:
      Array.isArray(body.monthKeys) ? [...new Set(body.monthKeys.map((v) => v.trim()).filter(Boolean))] : undefined,
    startMonthKey: typeof body.startMonthKey === "string" ? body.startMonthKey.trim() : undefined,
    endMonthKey: typeof body.endMonthKey === "string" ? body.endMonthKey.trim() : undefined,
    monthsCount: typeof body.monthsCount === "number" ? body.monthsCount : undefined,
    weekKey: typeof body.weekKey === "string" ? body.weekKey.trim() : undefined,
    weekKeys:
      Array.isArray(body.weekKeys) ? [...new Set(body.weekKeys.map((v) => v.trim()).filter(Boolean))] : undefined,
    startsAtUtc: typeof body.startsAtUtc === "string" ? body.startsAtUtc : undefined,
    startsAtUtcValues:
      Array.isArray(body.startsAtUtcValues)
        ? [...new Set(body.startsAtUtcValues.map((v) => v.trim()).filter(Boolean))]
        : undefined,
    companyName: body.companyName.trim(),
    customerEmail: body.customerEmail.trim(),
    orderRef: rawOrderReference.trim(),
    internalNote: typeof body.internalNote === "string" ? body.internalNote : undefined,
  };
}

function parseDeleteBody(payload: unknown): { groupId?: string; id?: string } {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid JSON body");
  }
  const body = payload as Record<string, unknown>;

  if (typeof body.groupId === "string" && body.groupId.trim()) {
    return { groupId: body.groupId.trim() };
  }
  if (typeof body.id === "string" && body.id.trim()) {
    return { id: body.id.trim() };
  }

  throw new Error("Provide groupId or id");
}

export async function POST(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return unauthorized();
  }

  let input: ReturnType<typeof parseCreateBody>;
  try {
    input = parseCreateBody((await request.json()) as unknown);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return badRequest(message);
  }

  const currentWeekKey = getWeekKeyFromDate(new Date(), BUSINESS_TZ);
  const currentMonthKey = getMonthKeyFromDate(new Date(), BUSINESS_TZ);

  if (input.product === Product.SPONSORSHIP) {
    let sponsorshipRange: ReturnType<typeof normalizeSponsorshipMonths>;
    try {
      sponsorshipRange = normalizeSponsorshipMonths({
        startMonthKey: input.startMonthKey,
        endMonthKey: input.endMonthKey,
        monthsCount: input.monthsCount,
        monthKeys: input.monthKeys,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid sponsorship range";
      return badRequest(message);
    }

    const groupId = sponsorshipRange.monthKeys.length > 1 ? randomUUID() : input.groupId ?? null;
    if (compareMonthKeys(sponsorshipRange.startMonthKey, currentMonthKey) <= 0) {
      return NextResponse.json(
        { code: "MONTH_ALREADY_STARTED", message: "Cannot book current or past month" },
        { status: 400 }
      );
    }

    const existing = await prisma.booking.findFirst({
      where: {
        AND: [getActiveBookingWhere()],
        product: Product.SPONSORSHIP,
        monthKey: { in: sponsorshipRange.monthKeys },
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ code: "MONTH_ALREADY_BOOKED" }, { status: 409 });
    }

    try {
      const created = await prisma.$transaction(async (tx) => {
        const rows = [];
        for (const monthKey of sponsorshipRange.monthKeys) {
          rows.push(
            await tx.booking.create({
              data: {
                product: Product.SPONSORSHIP,
                groupId,
                monthKey,
                weekKey: null,
                startsAtUtc: null,
                endsAtUtc: null,
                companyName: input.companyName,
                customerEmail: input.customerEmail,
                orderRef: input.orderRef,
                internalNote: input.internalNote ?? null,
              },
            })
          );
        }
        return rows;
      });

      return NextResponse.json(
        {
          groupId,
          startMonthKey: sponsorshipRange.startMonthKey,
          endMonthKey: sponsorshipRange.endMonthKey,
          monthsCount: sponsorshipRange.monthsCount,
          label: formatMonthRange(sponsorshipRange.monthKeys),
          bookings: created,
        },
        { status: 201 }
      );
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json({ code: "MONTH_ALREADY_BOOKED" }, { status: 409 });
      }
      return NextResponse.json({ code: "INTERNAL_SERVER_ERROR" }, { status: 500 });
    }
  }

  if (input.product === Product.ADS && input.weekKeys && input.weekKeys.length > 0) {
    if (input.weekKeys.some((weekKey) => isLockedWeek(weekKey, currentWeekKey))) {
      return NextResponse.json(
        { code: "WEEK_ALREADY_STARTED", message: "Cannot book started/past week" },
        { status: 400 }
      );
    }

    const groupId = input.weekKeys.length > 1 ? randomUUID() : input.groupId ?? null;

    try {
      const created = await prisma.$transaction(
        async (tx) => {
          const rows = [];
          for (const weekKey of input.weekKeys!) {
            const activeCount = await tx.booking.count({
              where: {
                AND: [getActiveBookingWhere()],
                product: Product.ADS,
                weekKey,
              },
            });
            if (activeCount >= 10) {
              throw new Error("ADS_CAPACITY_REACHED");
            }

            rows.push(
              await tx.booking.create({
                data: {
                  product: Product.ADS,
                  groupId,
                  weekKey,
                  monthKey: null,
                  startsAtUtc: null,
                  endsAtUtc: null,
                  companyName: input.companyName,
                  customerEmail: input.customerEmail,
                  orderRef: input.orderRef,
                  internalNote: input.internalNote ?? null,
                },
              })
            );
          }
          return rows;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

      return NextResponse.json({ bookings: created }, { status: 201 });
    } catch (error) {
      if (error instanceof Error && error.message === "ADS_CAPACITY_REACHED") {
        return NextResponse.json(
          { code: "ADS_CAPACITY_REACHED", message: "Cannot book full week" },
          { status: 400 }
        );
      }
      return NextResponse.json({ code: "INTERNAL_SERVER_ERROR" }, { status: 500 });
    }
  }

  if (input.product === Product.ADS && input.weekKey && isLockedWeek(input.weekKey, currentWeekKey)) {
    return NextResponse.json(
      { code: "WEEK_ALREADY_STARTED", message: "Cannot book started/past week" },
      { status: 400 }
    );
  }

  if (input.product === Product.ADS && input.weekKey) {
    const count = await prisma.booking.count({
      where: {
        AND: [getActiveBookingWhere()],
        product: Product.ADS,
        weekKey: input.weekKey,
      },
    });
    if (count >= 10) {
      return NextResponse.json(
        { code: "ADS_CAPACITY_REACHED", message: "Cannot book full week" },
        { status: 400 }
      );
    }
  }

  if (
    (input.product === Product.NEWS || input.product === Product.PROMO || input.product === Product.GIVEAWAY) &&
    input.startsAtUtcValues &&
    input.startsAtUtcValues.length > 0
  ) {
    const groupId = input.startsAtUtcValues.length > 1 ? randomUUID() : input.groupId ?? null;
    const created = [];
    for (const startsAtUtc of input.startsAtUtcValues) {
      try {
        created.push(
          await createBooking({
            product: input.product,
            groupId,
            startsAtUtc,
            companyName: input.companyName,
            customerEmail: input.customerEmail,
            orderRef: input.orderRef,
            internalNote: input.internalNote,
          })
        );
      } catch (error) {
        if (error instanceof Error && BOOKING_ERROR_CODES.has(error.message as BookingCreateErrorCode)) {
          return NextResponse.json({ code: error.message }, { status: 409 });
        }
        return NextResponse.json({ code: "INTERNAL_SERVER_ERROR" }, { status: 500 });
      }
    }
    return NextResponse.json({ groupId, bookings: created }, { status: 201 });
  }

  try {
    const booking = await createBooking({
      product: input.product,
      groupId: input.groupId,
      monthKey: input.monthKey,
      weekKey: input.weekKey,
      startsAtUtc: input.startsAtUtc,
      companyName: input.companyName,
      customerEmail: input.customerEmail,
      orderRef: input.orderRef,
      internalNote: input.internalNote,
    });
    return NextResponse.json(booking, { status: 201 });
  } catch (error) {
    if (error instanceof Error && BOOKING_ERROR_CODES.has(error.message as BookingCreateErrorCode)) {
      return NextResponse.json({ code: error.message }, { status: 409 });
    }
    return NextResponse.json({ code: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return unauthorized();
  }

  const params = request.nextUrl.searchParams;

  let from: Date;
  let to: Date;

  try {
    from = parseDateParam(params.get("from"), "from") ?? new Date();
    to = parseDateParam(params.get("to"), "to") ?? addMonths(from, 12);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return badRequest(message);
  }

  if (to.getTime() < from.getTime()) {
    return badRequest("to must be greater than or equal to from");
  }

  const fromWeekKey = getWeekKeyFromDate(from, BUSINESS_TZ);
  const toWeekKey = getWeekKeyFromDate(to, BUSINESS_TZ);
  const fromMonthKey = getMonthKeyFromDate(from, BUSINESS_TZ);
  const toMonthKey = getMonthKeyFromDate(to, BUSINESS_TZ);

  const bookings = await prisma.booking.findMany({
    where: {
      OR: [
        {
          product: { in: [Product.NEWS, Product.PROMO, Product.GIVEAWAY] },
          startsAtUtc: { gte: from, lte: to },
        },
        {
          product: Product.ADS,
          weekKey: { gte: fromWeekKey, lte: toWeekKey },
        },
        {
          product: Product.SPONSORSHIP,
          monthKey: { gte: fromMonthKey, lte: toMonthKey },
        },
      ],
    },
    select: {
      id: true,
      groupId: true,
      product: true,
      weekKey: true,
      monthKey: true,
      startsAtUtc: true,
      companyName: true,
      status: true,
      orderRef: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });

  const grouped = new Map<
    string,
    {
      baseId: string;
      groupId: string | null;
      product: Product;
      companyName: string;
      status: BookingStatus;
      orderRef: string;
      weekKeys: string[];
      monthKeys: string[];
      startsAtUtcValues: string[];
      bookingIds: string[];
      createdAt: string;
    }
  >();

  for (const booking of bookings) {
    const key = booking.groupId ?? booking.id;
    if (!grouped.has(key)) {
      grouped.set(key, {
        baseId: key,
        groupId: booking.groupId,
        product: booking.product,
        companyName: booking.companyName,
        status: booking.status,
        orderRef: booking.orderRef,
        weekKeys: [],
        monthKeys: [],
        startsAtUtcValues: [],
        bookingIds: [],
        createdAt: booking.createdAt.toISOString(),
      });
    }

    const row = grouped.get(key)!;
    row.bookingIds.push(booking.id);
    if (booking.weekKey) row.weekKeys.push(booking.weekKey);
    if (booking.monthKey) row.monthKeys.push(booking.monthKey);
    if (booking.startsAtUtc) row.startsAtUtcValues.push(booking.startsAtUtc.toISOString());
  }

  const items: GroupedBookingItem[] = Array.from(grouped.values()).map((row) => {
    const weekKeys = [...new Set(row.weekKeys)].sort();
    const monthKeys = [...new Set(row.monthKeys)].sort();
    const starts = [...new Set(row.startsAtUtcValues)].sort();

    let slotLabel = "-";
    if (row.product === Product.ADS) {
      slotLabel = formatWeekRange(weekKeys);
    } else if (row.product === Product.SPONSORSHIP) {
      slotLabel = formatMonthRange(monthKeys);
    } else if (starts.length > 1) {
      slotLabel = formatPostSlotLabel(starts);
    } else if (starts.length === 1) {
      slotLabel = formatPostSlotLabel(starts);
    }

    return {
      key: row.groupId ? `grp:${row.groupId}` : `id:${row.baseId}`,
      groupId: row.groupId,
      product: row.product,
      slotLabel,
      companyName: row.companyName,
      status: row.status,
      orderReference: row.orderRef,
      bookingIds: row.bookingIds,
      createdAt: row.createdAt,
    };
  });

  items.sort((a, b) => a.slotLabel.localeCompare(b.slotLabel) || a.createdAt.localeCompare(b.createdAt));

  return NextResponse.json({ items });
}

export async function DELETE(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return unauthorized();
  }

  let parsed: { groupId?: string; id?: string };
  try {
    parsed = parseDeleteBody((await request.json()) as unknown);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return badRequest(message);
  }

  const protectedCount = await prisma.booking.count({
    where: parsed.groupId
      ? { groupId: parsed.groupId, reservationLocked: true }
      : { id: parsed.id!, reservationLocked: true },
  });
  if (protectedCount > 0) {
    return NextResponse.json(
      { code: "PROTECTED_RESERVATION", message: "Protected reservations cannot be deleted." },
      { status: 409 }
    );
  }

  const result = parsed.groupId
    ? await prisma.booking.deleteMany({ where: { groupId: parsed.groupId, reservationLocked: false } })
    : await prisma.booking.deleteMany({ where: { id: parsed.id!, reservationLocked: false } });

  const deletedCount = result.count;
  if (deletedCount === 0) {
    return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ deletedCount });
}
