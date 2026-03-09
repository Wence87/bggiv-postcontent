import crypto from "crypto";
import { BookingStatus, Prisma, Product, ReservationSource } from "@prisma/client";
import { createBooking } from "@/lib/bookingService";
import { prisma } from "@/lib/prisma";

const RESERVATION_HOURS = 12;

export type ReservationInput = {
  token: string;
  productType: string;
  monthKey?: string;
  weekKey?: string;
  startsAtUtc?: string;
  adsDurationWeeks?: number;
  linkedOrderId?: string | null;
};

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export function tokenReservationRef(token: string): string {
  return `token:${crypto.createHash("sha256").update(token).digest("hex")}`;
}

function mapProduct(productType: string): Product {
  if (productType === "sponsorship") return Product.SPONSORSHIP;
  if (productType === "ads") return Product.ADS;
  if (productType === "promo") return Product.PROMO;
  if (productType === "giveaway") return Product.GIVEAWAY;
  return Product.NEWS;
}

export async function cancelActiveReservationByToken(token: string): Promise<void> {
  const active = await prisma.booking.findMany({
    where: {
      reservedByOrderId: tokenReservationRef(token),
      status: BookingStatus.DRAFT_RESERVED,
      reservationLocked: false,
      expiresAt: {
        gt: new Date(),
      },
    },
    select: {
      id: true,
      reservationSource: true,
      reservedByOrderId: true,
      linkedOrderId: true,
    },
  });

  if (active.length < 1) return;

  await prisma.booking.updateMany({
    where: {
      id: { in: active.map((entry) => entry.id) },
    },
    data: {
      status: BookingStatus.CANCELLED,
    },
  });

  for (const reservation of active) {
    console.info("[reservation-audit] cancelled", {
      reservationId: reservation.id,
      reason: "replace_by_new_selection",
      source: reservation.reservationSource,
      linkedOrderId: reservation.linkedOrderId ?? null,
      reservedByOrderId: reservation.reservedByOrderId ?? null,
      ts: new Date().toISOString(),
    });
  }
}

export async function reserveForSubmit(input: ReservationInput) {
  const product = mapProduct(input.productType);
  const expiresAt = addHours(new Date(), RESERVATION_HOURS);

  if (product === Product.ADS) {
    return reserveAdsWeeksForSubmit(input, expiresAt);
  }

  await cancelActiveReservationByToken(input.token);

  const booking = await createBooking({
    product,
    status: BookingStatus.DRAFT_RESERVED,
    reservationSource: ReservationSource.DRAFT_HOLD,
    reservationLocked: false,
    monthKey: input.monthKey,
    weekKey: input.weekKey,
    startsAtUtc: input.startsAtUtc,
    reservedByOrderId: tokenReservationRef(input.token),
    linkedOrderId: input.linkedOrderId ?? null,
    expiresAt,
    companyName: "Pending submission",
    customerEmail: "pending@example.com",
    orderRef: tokenReservationRef(input.token),
  });

  return [booking];
}

function parseWeekKey(weekKey: string): { year: number; week: number } | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!match) return null;
  return { year: Number(match[1]), week: Number(match[2]) };
}

function formatWeekKey(year: number, week: number): string {
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function weeksInIsoYear(year: number): number {
  const dec28 = new Date(Date.UTC(year, 11, 28));
  const dayNumber = (dec28.getUTCDay() + 6) % 7;
  dec28.setUTCDate(dec28.getUTCDate() - dayNumber + 3);
  const isoYear = dec28.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  jan4.setUTCDate(jan4.getUTCDate() - jan4Day + 3);
  return 1 + Math.round((dec28.getTime() - jan4.getTime()) / 604800000);
}

function nextWeekKey(weekKey: string): string {
  const parsed = parseWeekKey(weekKey);
  if (!parsed) {
    throw new Error("WEEK_KEY_REQUIRED");
  }

  const maxWeek = weeksInIsoYear(parsed.year);
  if (parsed.week < maxWeek) {
    return formatWeekKey(parsed.year, parsed.week + 1);
  }
  return formatWeekKey(parsed.year + 1, 1);
}

function buildConsecutiveWeekKeys(startWeekKey: string, durationWeeks: number): string[] {
  const keys = [startWeekKey];
  let cursor = startWeekKey;
  for (let i = 1; i < durationWeeks; i += 1) {
    cursor = nextWeekKey(cursor);
    keys.push(cursor);
  }
  return keys;
}

function currentBrusselsWeekKey(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const part of formatter.formatToParts(now)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }

  const date = new Date(Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day)));
  const dayNumber = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNumber + 3);
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / 604800000);
  return formatWeekKey(isoYear, week);
}

function compareWeekKeys(left: string, right: string): number {
  const a = parseWeekKey(left);
  const b = parseWeekKey(right);
  if (!a || !b) return left.localeCompare(right);
  if (a.year !== b.year) return a.year - b.year;
  return a.week - b.week;
}

async function reserveAdsWeeksForSubmit(input: ReservationInput, expiresAt: Date) {
  if (!input.weekKey) {
    throw new Error("WEEK_KEY_REQUIRED");
  }
  const durationWeeks = Math.max(1, Math.min(52, Number(input.adsDurationWeeks ?? 1)));
  const weekKeys = buildConsecutiveWeekKeys(input.weekKey, durationWeeks);
  const tokenRef = tokenReservationRef(input.token);
  const now = new Date();
  const currentWeek = currentBrusselsWeekKey();

  return prisma.$transaction(
    async (tx) => {
      await tx.booking.updateMany({
        where: {
          reservedByOrderId: tokenRef,
          status: BookingStatus.DRAFT_RESERVED,
          reservationLocked: false,
          expiresAt: { gt: now },
        },
        data: { status: BookingStatus.CANCELLED },
      });

      for (const weekKey of weekKeys) {
        if (compareWeekKeys(weekKey, currentWeek) <= 0) {
          throw new Error("WEEK_LOCKED");
        }

        const count = await tx.booking.count({
          where: {
            AND: [
              {
                OR: [
                  { status: BookingStatus.SUBMITTED },
                  { status: BookingStatus.PUBLISHED },
                  { status: BookingStatus.DRAFT_RESERVED, expiresAt: { gt: now } },
                ],
              } as Prisma.BookingWhereInput,
            ],
            product: Product.ADS,
            weekKey,
          },
        });
        if (count >= 10) {
          throw new Error("ADS_CAPACITY_REACHED");
        }
      }

      const created = [];
      for (const weekKey of weekKeys) {
        const booking = await tx.booking.create({
          data: {
            product: Product.ADS,
            status: BookingStatus.DRAFT_RESERVED,
            weekKey,
            monthKey: null,
            startsAtUtc: null,
            endsAtUtc: null,
            reservedByOrderId: tokenRef,
            reservationSource: ReservationSource.DRAFT_HOLD,
            reservationLocked: false,
            linkedOrderId: input.linkedOrderId ?? null,
            expiresAt,
            companyName: "Pending submission",
            customerEmail: "pending@example.com",
            orderRef: tokenRef,
            internalNote: null,
          },
        });
        created.push(booking);
      }

      return created;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

export async function getActiveReservationsByToken(token: string) {
  return prisma.booking.findMany({
    where: {
      reservedByOrderId: tokenReservationRef(token),
      status: BookingStatus.DRAFT_RESERVED,
      expiresAt: {
        gt: new Date(),
      },
    },
    orderBy: [{ weekKey: "asc" }, { startsAtUtc: "asc" }, { createdAt: "desc" }],
  });
}
