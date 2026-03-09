import { BookingStatus, Prisma, Product, ReservationSource, type Booking } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

export type BookingCreateErrorCode =
  | "INVALID_PRODUCT"
  | "INVALID_DATETIME"
  | "MONTH_KEY_REQUIRED"
  | "MONTH_ALREADY_BOOKED"
  | "WEEK_KEY_REQUIRED"
  | "ADS_CAPACITY_REACHED"
  | "STARTS_AT_REQUIRED"
  | "STARTS_AT_MUST_BE_FULL_HOUR"
  | "HOUR_ALREADY_BOOKED"
  | "POST_LEADTIME_LOCKED"
  | "DAY_ALREADY_HAS_POST"
  | "PROMO_DAILY_LIMIT"
  | "GIVEAWAY_DAILY_LIMIT";

export type CreateBookingInput = {
  product: Product;
  status?: BookingStatus;
  reservationSource?: ReservationSource;
  reservationLocked?: boolean;
  groupId?: string | null;
  startsAtUtc?: Date | string | null;
  endsAtUtc?: Date | string | null;
  monthKey?: string | null;
  weekKey?: string | null;
  reservedByOrderId?: string | null;
  linkedOrderId?: string | null;
  expiresAt?: Date | string | null;
  companyName: string;
  customerEmail: string;
  orderRef: string;
  internalNote?: string | null;
};

const POSTS_PRODUCTS: Product[] = [Product.NEWS, Product.PROMO, Product.GIVEAWAY];
const BUSINESS_TZ = "Europe/Brussels";
const LOCK_DAYS = 3;

export type PostAvailabilityStatus = "available" | "taken" | "locked";
export type PostsAvailabilityDay = {
  dayStatus: PostAvailabilityStatus;
  hours: Record<number, PostAvailabilityStatus>;
};

function throwBookingError(code: BookingCreateErrorCode): never {
  throw new Error(code);
}

function parseOptionalDate(value: Date | string | null | undefined): Date | null {
  if (value == null) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throwBookingError("INVALID_DATETIME");
  }

  return parsed;
}

export function normalizeUtcHour(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), 0, 0, 0)
  );
}

function assertStartsAtIsFullHour(value: Date): void {
  if (
    value.getUTCMinutes() !== 0 ||
    value.getUTCSeconds() !== 0 ||
    value.getUTCMilliseconds() !== 0
  ) {
    throwBookingError("STARTS_AT_MUST_BE_FULL_HOUR");
  }
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

  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
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

function resolveZonedMidnightToUtc(
  year: number,
  month: number,
  day: number,
  timeZone: string
): Date {
  const utcMidnightGuess = Date.UTC(year, month - 1, day, 0, 0, 0, 0);

  let utc = new Date(utcMidnightGuess - getOffsetMsForTimeZone(new Date(utcMidnightGuess), timeZone));
  utc = new Date(utcMidnightGuess - getOffsetMsForTimeZone(utc, timeZone));

  return utc;
}

function getBrusselsDayRangeUtc(reference: Date): { start: Date; end: Date } {
  const timeZone = BUSINESS_TZ;
  const parts = getTimeZoneParts(reference, timeZone);
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);

  const start = resolveZonedMidnightToUtc(year, month, day, timeZone);

  const brusselsCalendarDate = new Date(Date.UTC(year, month - 1, day));
  brusselsCalendarDate.setUTCDate(brusselsCalendarDate.getUTCDate() + 1);

  const end = resolveZonedMidnightToUtc(
    brusselsCalendarDate.getUTCFullYear(),
    brusselsCalendarDate.getUTCMonth() + 1,
    brusselsCalendarDate.getUTCDate(),
    timeZone
  );

  return { start, end };
}

function getDateKeyInTimeZone(reference: Date, timeZone: string): string {
  const parts = getTimeZoneParts(reference, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  base.setUTCDate(base.getUTCDate() + days);
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(base.getUTCDate()).padStart(2, "0")}`;
}

function resolveDateKeyRangeToUtc(dateKeyStart: string, dateKeyEndInclusive: string): { start: Date; endExclusive: Date } {
  const [startYear, startMonth, startDay] = dateKeyStart.split("-").map(Number);
  const [endYear, endMonth, endDay] = addDaysToDateKey(dateKeyEndInclusive, 1).split("-").map(Number);

  return {
    start: resolveZonedMidnightToUtc(startYear, startMonth, startDay, BUSINESS_TZ),
    endExclusive: resolveZonedMidnightToUtc(endYear, endMonth, endDay, BUSINESS_TZ),
  };
}

function getPostProductFromView(product: "news" | "promo" | "giveaway"): Product {
  if (product === "promo") return Product.PROMO;
  if (product === "giveaway") return Product.GIVEAWAY;
  return Product.NEWS;
}

function isLockedDay(dateKey: string): boolean {
  const todayKey = getDateKeyInTimeZone(new Date(), BUSINESS_TZ);
  const lockThresholdExclusive = addDaysToDateKey(todayKey, LOCK_DAYS);
  return dateKey < lockThresholdExclusive;
}

function enumerateDateKeys(fromDateKey: string, toDateKey: string): string[] {
  const keys: string[] = [];
  let cursor = fromDateKey;
  while (cursor <= toDateKey) {
    keys.push(cursor);
    cursor = addDaysToDateKey(cursor, 1);
  }
  return keys;
}

export function getActiveBookingWhere(now: Date = new Date()): Prisma.BookingWhereInput {
  return {
    OR: [
      { status: BookingStatus.SUBMITTED },
      { status: BookingStatus.PUBLISHED },
      {
        status: BookingStatus.DRAFT_RESERVED,
        expiresAt: {
          gt: now,
        },
      },
    ],
  };
}

export async function getPostsAvailability(
  productView: "news" | "promo" | "giveaway",
  from: Date,
  to: Date
): Promise<{
  days: Record<string, PostsAvailabilityDay>;
  meta: { lockDays: number; tz: string };
}> {
  const product = getPostProductFromView(productView);
  const fromDateKey = getDateKeyInTimeZone(from, BUSINESS_TZ);
  const toDateKey = getDateKeyInTimeZone(to, BUSINESS_TZ);
  const dateKeys = enumerateDateKeys(fromDateKey, toDateKey);
  const { start, endExclusive } = resolveDateKeyRangeToUtc(fromDateKey, toDateKey);

  const bookings = await prisma.booking.findMany({
    where: {
      AND: [getActiveBookingWhere()],
      product: { in: POSTS_PRODUCTS },
      startsAtUtc: {
        gte: start,
        lt: endExclusive,
      },
    },
    select: {
      product: true,
      startsAtUtc: true,
    },
  });

  const globalTakenHoursByDay = new Map<string, Set<number>>();
  const promoCountByDay = new Map<string, number>();
  const giveawayCountByDay = new Map<string, number>();
  for (const booking of bookings) {
    if (!booking.startsAtUtc) continue;

    const parts = getTimeZoneParts(booking.startsAtUtc, BUSINESS_TZ);
    const dayKey = `${parts.year}-${parts.month}-${parts.day}`;
    const hourInt = Number(parts.hour);

    if (!globalTakenHoursByDay.has(dayKey)) {
      globalTakenHoursByDay.set(dayKey, new Set<number>());
    }
    globalTakenHoursByDay.get(dayKey)!.add(hourInt);
    if (booking.product === Product.PROMO) {
      promoCountByDay.set(dayKey, (promoCountByDay.get(dayKey) ?? 0) + 1);
    } else if (booking.product === Product.GIVEAWAY) {
      giveawayCountByDay.set(dayKey, (giveawayCountByDay.get(dayKey) ?? 0) + 1);
    }
  }

  const days: Record<string, PostsAvailabilityDay> = {};

  for (const dayKey of dateKeys) {
    const takenHours = globalTakenHoursByDay.get(dayKey) ?? new Set<number>();
    const promoCount = promoCountByDay.get(dayKey) ?? 0;
    const giveawayCount = giveawayCountByDay.get(dayKey) ?? 0;
    const locked = isLockedDay(dayKey);
    const hours: Record<number, PostAvailabilityStatus> = {};

    for (let hour = 0; hour < 24; hour += 1) {
      if (locked) {
        hours[hour] = takenHours.has(hour) ? "taken" : "locked";
      } else if (takenHours.has(hour)) {
        hours[hour] = "taken";
      } else if (product === Product.PROMO && promoCount >= 2) {
        hours[hour] = "taken";
      } else if (product === Product.GIVEAWAY && giveawayCount >= 2) {
        hours[hour] = "taken";
      } else {
        hours[hour] = "available";
      }
    }

    let dayStatus: PostAvailabilityStatus = "available";
    if (locked) {
      dayStatus = takenHours.size > 0 ? "taken" : "locked";
    } else {
      const hasAvailableHour = Object.values(hours).some((status) => status === "available");
      dayStatus = hasAvailableHour ? "available" : "taken";
    }

    days[dayKey] = { dayStatus, hours };
  }

  return {
    days,
    meta: {
      lockDays: LOCK_DAYS,
      tz: BUSINESS_TZ,
    },
  };
}

function isPostsProduct(product: Product): boolean {
  return POSTS_PRODUCTS.includes(product);
}

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  const parsedStartsAtUtc = parseOptionalDate(input.startsAtUtc);
  const parsedEndsAtUtc = parseOptionalDate(input.endsAtUtc);
  const parsedExpiresAt = parseOptionalDate(input.expiresAt);
  const status = input.status ?? BookingStatus.SUBMITTED;
  const reservationSource = input.reservationSource ?? ReservationSource.LEGACY;
  const reservationLocked = input.reservationLocked ?? false;

  if (input.product === Product.SPONSORSHIP) {
    if (!input.monthKey) {
      throwBookingError("MONTH_KEY_REQUIRED");
    }

    const sponsorshipData: Prisma.BookingCreateInput = {
      product: Product.SPONSORSHIP,
      status,
      reservationSource,
      reservationLocked,
      groupId: input.groupId ?? null,
      monthKey: input.monthKey,
      weekKey: null,
      startsAtUtc: null,
      endsAtUtc: parsedEndsAtUtc,
      reservedByOrderId: input.reservedByOrderId ?? null,
      linkedOrderId: input.linkedOrderId ?? null,
      expiresAt: parsedExpiresAt,
      companyName: input.companyName,
      customerEmail: input.customerEmail,
      orderRef: input.orderRef,
      internalNote: input.internalNote ?? null,
    };

    try {
      return await prisma.booking.create({ data: sponsorshipData });
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
        throwBookingError("MONTH_ALREADY_BOOKED");
      }
      throw error;
    }
  }

  if (input.product === Product.ADS) {
    if (!input.weekKey) {
      throwBookingError("WEEK_KEY_REQUIRED");
    }

    const adsData: Prisma.BookingCreateInput = {
      product: Product.ADS,
      status,
      reservationSource,
      reservationLocked,
      groupId: input.groupId ?? null,
      monthKey: null,
      weekKey: input.weekKey,
      startsAtUtc: null,
      endsAtUtc: parsedEndsAtUtc,
      reservedByOrderId: input.reservedByOrderId ?? null,
      linkedOrderId: input.linkedOrderId ?? null,
      expiresAt: parsedExpiresAt,
      companyName: input.companyName,
      customerEmail: input.customerEmail,
      orderRef: input.orderRef,
      internalNote: input.internalNote ?? null,
    };

    return prisma.$transaction(
      async (tx) => {
        const count = await tx.booking.count({
          where: {
            AND: [getActiveBookingWhere()],
            product: Product.ADS,
            weekKey: input.weekKey,
          },
        });

        if (count >= 10) {
          throwBookingError("ADS_CAPACITY_REACHED");
        }

        return tx.booking.create({ data: adsData });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  if (isPostsProduct(input.product)) {
    if (!parsedStartsAtUtc) {
      throwBookingError("STARTS_AT_REQUIRED");
    }

    const startsAtUtc = normalizeUtcHour(parsedStartsAtUtc);
    assertStartsAtIsFullHour(startsAtUtc);
    const postDateKey = getDateKeyInTimeZone(startsAtUtc, BUSINESS_TZ);
    if (isLockedDay(postDateKey)) {
      throwBookingError("POST_LEADTIME_LOCKED");
    }

    const postData: Prisma.BookingCreateInput = {
      product: input.product,
      status,
      reservationSource,
      reservationLocked,
      groupId: input.groupId ?? null,
      monthKey: null,
      weekKey: null,
      startsAtUtc,
      endsAtUtc: parsedEndsAtUtc,
      reservedByOrderId: input.reservedByOrderId ?? null,
      linkedOrderId: input.linkedOrderId ?? null,
      expiresAt: parsedExpiresAt,
      companyName: input.companyName,
      customerEmail: input.customerEmail,
      orderRef: input.orderRef,
      internalNote: input.internalNote ?? null,
    };

    return prisma.$transaction(
      async (tx) => {
        const sameHourCount = await tx.booking.count({
          where: {
            AND: [getActiveBookingWhere()],
            product: { in: POSTS_PRODUCTS },
            startsAtUtc,
          },
        });

        if (sameHourCount > 0) {
          throwBookingError("HOUR_ALREADY_BOOKED");
        }

        if (input.product === Product.PROMO || input.product === Product.GIVEAWAY) {
          const { start, end } = getBrusselsDayRangeUtc(startsAtUtc);
          const sameProductDayCount = await tx.booking.count({
            where: {
              AND: [getActiveBookingWhere()],
              product: input.product,
              startsAtUtc: {
                gte: start,
                lt: end,
              },
            },
          });

          if (sameProductDayCount >= 2) {
            if (input.product === Product.PROMO) {
              throwBookingError("PROMO_DAILY_LIMIT");
            }
            throwBookingError("GIVEAWAY_DAILY_LIMIT");
          }
        }

        return tx.booking.create({ data: postData });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  throwBookingError("INVALID_PRODUCT");
}
