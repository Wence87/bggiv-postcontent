import crypto from "crypto";
import { BookingStatus, Product } from "@prisma/client";
import { createBooking } from "@/lib/bookingService";
import { prisma } from "@/lib/prisma";

const RESERVATION_HOURS = 12;

export type ReservationInput = {
  token: string;
  productType: string;
  monthKey?: string;
  weekKey?: string;
  startsAtUtc?: string;
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
  await prisma.booking.updateMany({
    where: {
      reservedByOrderId: tokenReservationRef(token),
      status: BookingStatus.DRAFT_RESERVED,
      expiresAt: {
        gt: new Date(),
      },
    },
    data: {
      status: BookingStatus.CANCELLED,
    },
  });
}

export async function reserveForSubmit(input: ReservationInput) {
  const product = mapProduct(input.productType);
  const expiresAt = addHours(new Date(), RESERVATION_HOURS);

  await cancelActiveReservationByToken(input.token);

  return createBooking({
    product,
    status: BookingStatus.DRAFT_RESERVED,
    monthKey: input.monthKey,
    weekKey: input.weekKey,
    startsAtUtc: input.startsAtUtc,
    reservedByOrderId: tokenReservationRef(input.token),
    expiresAt,
    companyName: "Pending submission",
    customerEmail: "pending@example.com",
    orderRef: tokenReservationRef(input.token),
  });
}

export async function getActiveReservationByToken(token: string) {
  return prisma.booking.findFirst({
    where: {
      reservedByOrderId: tokenReservationRef(token),
      status: BookingStatus.DRAFT_RESERVED,
      expiresAt: {
        gt: new Date(),
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
