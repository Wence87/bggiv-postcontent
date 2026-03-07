import { Prisma } from "@prisma/client";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";

export type AdsSubmissionInput = {
  token: string;
  productKey: string;
  productType: string;
  companyName: string;
  contactEmail: string;
  websiteUrl: string;
  targetUrl: string;
  adFormat: string;
  startDate: string;
  notes?: string;
  reservation?: {
    monthKey?: string;
    weekKey?: string;
    startsAtUtc?: string;
  };
  bannerImage: {
    name: string;
    mimeType: string;
    size: number;
    data: ArrayBuffer;
  };
  formData: Record<string, unknown>;
};

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function saveAdsSubmission(input: AdsSubmissionInput) {
  return saveAdsSubmissionWithDb(prisma, input);
}

export async function saveAdsSubmissionWithDb(
  db: PrismaClient | Prisma.TransactionClient,
  input: AdsSubmissionInput
) {
  const parsedStartDate = new Date(input.startDate);
  if (Number.isNaN(parsedStartDate.getTime())) {
    throw new Error("INVALID_START_DATE");
  }
  const parsedReservationStartsAt =
    input.reservation?.startsAtUtc && input.reservation.startsAtUtc.trim()
      ? new Date(input.reservation.startsAtUtc)
      : null;
  if (parsedReservationStartsAt && Number.isNaN(parsedReservationStartsAt.getTime())) {
    throw new Error("INVALID_RESERVATION_START");
  }

  const hashedToken = tokenHash(input.token);
  const imageBuffer = Buffer.from(input.bannerImage.data);
  const formDataJson = JSON.parse(JSON.stringify(input.formData)) as Prisma.InputJsonValue;

  return db.submitFormSubmission.upsert({
    where: {
      tokenHash: hashedToken,
    },
    create: {
      tokenHash: hashedToken,
      productKey: input.productKey,
      productType: input.productType,
      companyName: input.companyName,
      contactEmail: input.contactEmail,
      websiteUrl: input.websiteUrl,
      targetUrl: input.targetUrl,
      adFormat: input.adFormat,
      startDate: parsedStartDate,
      notes: input.notes || null,
      bannerImageName: input.bannerImage.name,
      bannerImageMimeType: input.bannerImage.mimeType,
      bannerImageSize: input.bannerImage.size,
      bannerImageData: imageBuffer,
      reservationMonthKey: input.reservation?.monthKey || null,
      reservationWeekKey: input.reservation?.weekKey || null,
      reservationStartsAt: parsedReservationStartsAt,
      formDataJson,
    },
    update: {
      productKey: input.productKey,
      productType: input.productType,
      companyName: input.companyName,
      contactEmail: input.contactEmail,
      websiteUrl: input.websiteUrl,
      targetUrl: input.targetUrl,
      adFormat: input.adFormat,
      startDate: parsedStartDate,
      notes: input.notes || null,
      bannerImageName: input.bannerImage.name,
      bannerImageMimeType: input.bannerImage.mimeType,
      bannerImageSize: input.bannerImage.size,
      bannerImageData: imageBuffer,
      reservationMonthKey: input.reservation?.monthKey || null,
      reservationWeekKey: input.reservation?.weekKey || null,
      reservationStartsAt: parsedReservationStartsAt,
      formDataJson,
    },
  });
}
