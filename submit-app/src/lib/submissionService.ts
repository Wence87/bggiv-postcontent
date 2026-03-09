import { BookingStatus, Product, ReservationSource, SubmissionDraftStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createBooking, getActiveBookingWhere } from "@/lib/bookingService";
import type { SubmitTokenPayload } from "@/lib/submitToken";

const RESERVATION_HOURS = 12;

type ReserveSlotInput = {
  monthKey?: string;
  weekKey?: string;
  startsAtUtc?: string;
};

export function productFromToken(productType: SubmitTokenPayload["product_type"]): Product {
  if (productType === "sponsorship") return Product.SPONSORSHIP;
  if (productType === "ads") return Product.ADS;
  if (productType === "promo") return Product.PROMO;
  if (productType === "giveaway") return Product.GIVEAWAY;
  return Product.NEWS;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export async function getOrCreateSubmissionDraft(payload: SubmitTokenPayload) {
  return prisma.submissionDraft.upsert({
    where: { orderId: payload.order_id },
    create: {
      orderId: payload.order_id,
      orderKey: payload.order_key,
      email: payload.email,
      product: productFromToken(payload.product_type),
      durationWeeks: payload.duration_weeks,
      status: SubmissionDraftStatus.DRAFT,
    },
    update: {
      orderKey: payload.order_key,
      email: payload.email,
      product: productFromToken(payload.product_type),
      durationWeeks: payload.duration_weeks,
    },
    include: {
      booking: true,
    },
  });
}

function assertDraftMatchesToken(payload: SubmitTokenPayload, orderKey: string, email: string) {
  if (orderKey !== payload.order_key) {
    throw new Error("ORDER_KEY_MISMATCH");
  }
  if (email.toLowerCase() !== payload.email.toLowerCase()) {
    throw new Error("EMAIL_MISMATCH");
  }
}

async function cancelExistingDraftReservation(draftOrderId: string) {
  const activeDraftReservation = await prisma.booking.findFirst({
    where: {
      status: BookingStatus.DRAFT_RESERVED,
      reservedByOrderId: draftOrderId,
      reservationLocked: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!activeDraftReservation) return;

  await prisma.booking.update({
    where: { id: activeDraftReservation.id },
    data: { status: BookingStatus.CANCELLED },
  });
}

export async function reserveDraftSlot(payload: SubmitTokenPayload, slot: ReserveSlotInput) {
  const draft = await prisma.submissionDraft.findUnique({
    where: { orderId: payload.order_id },
  });

  if (!draft) {
    throw new Error("DRAFT_NOT_FOUND");
  }

  assertDraftMatchesToken(payload, draft.orderKey, draft.email);

  const product = draft.product;
  const expiresAt = addHours(new Date(), RESERVATION_HOURS);

  await cancelExistingDraftReservation(draft.orderId);

  const startsAtUtc = slot.startsAtUtc ? new Date(slot.startsAtUtc) : undefined;
  if (startsAtUtc && Number.isNaN(startsAtUtc.getTime())) {
    throw new Error("INVALID_DATETIME");
  }

  const endsAtUtc =
    product === Product.GIVEAWAY && startsAtUtc && draft.durationWeeks
      ? addHours(startsAtUtc, draft.durationWeeks * 7 * 24)
      : undefined;

  const booking = await createBooking({
    product,
    status: BookingStatus.DRAFT_RESERVED,
    reservationSource: ReservationSource.DRAFT_HOLD,
    reservationLocked: false,
    reservedByOrderId: draft.orderId,
    linkedOrderId: payload.order_id,
    expiresAt,
    monthKey: slot.monthKey,
    weekKey: slot.weekKey,
    startsAtUtc: startsAtUtc?.toISOString(),
    endsAtUtc: endsAtUtc?.toISOString(),
    companyName: "Pending submission",
    customerEmail: draft.email,
    orderRef: draft.orderId,
  });

  return prisma.submissionDraft.update({
    where: { id: draft.id },
    data: {
      status: SubmissionDraftStatus.DRAFT,
      bookingId: booking.id,
    },
    include: { booking: true },
  });
}

export async function submitDraftContent(payload: SubmitTokenPayload, title: string, body: string) {
  if (!title.trim() || !body.trim()) {
    throw new Error("CONTENT_REQUIRED");
  }

  const draft = await prisma.submissionDraft.findUnique({
    where: { orderId: payload.order_id },
    include: { booking: true },
  });

  if (!draft) throw new Error("DRAFT_NOT_FOUND");
  assertDraftMatchesToken(payload, draft.orderKey, draft.email);
  if (!draft.bookingId || !draft.booking) throw new Error("BOOKING_REQUIRED");

  if (draft.booking.status !== BookingStatus.DRAFT_RESERVED) {
    throw new Error("BOOKING_NOT_RESERVABLE");
  }
  if (draft.booking.expiresAt && draft.booking.expiresAt.getTime() <= Date.now()) {
    throw new Error("BOOKING_EXPIRED");
  }

  return prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: draft.bookingId! },
      data: {
        status: BookingStatus.SUBMITTED,
        reservationSource: ReservationSource.WOOCOMMERCE_PAID_ORDER,
        reservationLocked: true,
        linkedOrderId: payload.order_id,
        expiresAt: null,
      },
    });

    return tx.submissionDraft.update({
      where: { id: draft.id },
      data: {
        status: SubmissionDraftStatus.SUBMITTED,
        title: title.trim(),
        body: body.trim(),
      },
      include: { booking: true },
    });
  });
}

export async function cleanupExpiredReservations(now: Date = new Date()) {
  const expiredCandidates = await prisma.booking.findMany({
    where: {
      status: BookingStatus.DRAFT_RESERVED,
      reservationLocked: false,
      reservationSource: { in: [ReservationSource.DRAFT_HOLD, ReservationSource.TEST_DATA, ReservationSource.LEGACY] },
      expiresAt: {
        lte: now,
      },
    },
    select: {
      id: true,
      reservationSource: true,
      linkedOrderId: true,
      reservedByOrderId: true,
      expiresAt: true,
    },
  });
  const expiredIds = expiredCandidates.map((entry) => entry.id);

  const expired = expiredIds.length
    ? await prisma.booking.updateMany({
        where: { id: { in: expiredIds } },
        data: { status: BookingStatus.CANCELLED },
      })
    : { count: 0 };

  const cancelledDrafts = await prisma.submissionDraft.updateMany({
    where: {
      status: SubmissionDraftStatus.DRAFT,
      booking: {
        is: {
          status: BookingStatus.CANCELLED,
        },
      },
    },
    data: {
      status: SubmissionDraftStatus.CANCELLED,
    },
  });

  for (const reservation of expiredCandidates) {
    console.info("[reservation-audit] cleaned", {
      reservationId: reservation.id,
      reason: "expired_draft_hold",
      source: reservation.reservationSource,
      linkedOrderId: reservation.linkedOrderId ?? null,
      reservedByOrderId: reservation.reservedByOrderId ?? null,
      expiredAt: reservation.expiresAt?.toISOString() ?? null,
      ts: now.toISOString(),
    });
  }

  return {
    expiredBookings: expired.count,
    cancelledDrafts: cancelledDrafts.count,
  };
}

export async function getBlockingCountsForProduct(product: Product, key: string, now: Date = new Date()) {
  if (product === Product.SPONSORSHIP) {
    return prisma.booking.count({
      where: {
        AND: [getActiveBookingWhere(now)],
        product,
        monthKey: key,
      },
    });
  }
  if (product === Product.ADS) {
    return prisma.booking.count({
      where: {
        AND: [getActiveBookingWhere(now)],
        product,
        weekKey: key,
      },
    });
  }
  return prisma.booking.count({
    where: {
      AND: [getActiveBookingWhere(now)],
      product: { in: [Product.NEWS, Product.PROMO, Product.GIVEAWAY] },
      startsAtUtc: new Date(key),
    },
  });
}
