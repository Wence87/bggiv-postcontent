import { Prisma } from "@prisma/client";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";

export type AdsSubmissionInput = {
  token: string;
  linkedOrderId?: string;
  orderNumber?: string;
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
  orderContext?: Record<string, unknown>;
  bannerImage: {
    name: string;
    mimeType: string;
    size: number;
    data: ArrayBuffer;
  };
  additionalImages?: Array<{
    name: string;
    mimeType: string;
    size: number;
    data: ArrayBuffer;
  }>;
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
  const additionalImageBuffers = (input.additionalImages ?? []).slice(0, 3).map((image) => ({
    name: image.name,
    mimeType: image.mimeType,
    size: image.size,
    data: Buffer.from(image.data),
  }));
  const additional1 = additionalImageBuffers[0];
  const additional2 = additionalImageBuffers[1];
  const additional3 = additionalImageBuffers[2];
  const formDataJson = JSON.parse(JSON.stringify(input.formData)) as Prisma.InputJsonValue;

  return db.submitFormSubmission.upsert({
    where: {
      tokenHash: hashedToken,
    },
    create: {
      tokenHash: hashedToken,
      linkedOrderId: input.linkedOrderId || null,
      orderNumber: input.orderNumber || null,
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
      additionalImage1Name: additional1?.name ?? null,
      additionalImage1MimeType: additional1?.mimeType ?? null,
      additionalImage1Size: additional1?.size ?? null,
      additionalImage1Data: additional1?.data ?? null,
      additionalImage2Name: additional2?.name ?? null,
      additionalImage2MimeType: additional2?.mimeType ?? null,
      additionalImage2Size: additional2?.size ?? null,
      additionalImage2Data: additional2?.data ?? null,
      additionalImage3Name: additional3?.name ?? null,
      additionalImage3MimeType: additional3?.mimeType ?? null,
      additionalImage3Size: additional3?.size ?? null,
      additionalImage3Data: additional3?.data ?? null,
      reservationMonthKey: input.reservation?.monthKey || null,
      reservationWeekKey: input.reservation?.weekKey || null,
      reservationStartsAt: parsedReservationStartsAt,
      orderContextJson: input.orderContext
        ? (JSON.parse(JSON.stringify(input.orderContext)) as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      formDataJson,
    },
    update: {
      linkedOrderId: input.linkedOrderId || null,
      orderNumber: input.orderNumber || null,
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
      additionalImage1Name: additional1?.name ?? null,
      additionalImage1MimeType: additional1?.mimeType ?? null,
      additionalImage1Size: additional1?.size ?? null,
      additionalImage1Data: additional1?.data ?? null,
      additionalImage2Name: additional2?.name ?? null,
      additionalImage2MimeType: additional2?.mimeType ?? null,
      additionalImage2Size: additional2?.size ?? null,
      additionalImage2Data: additional2?.data ?? null,
      additionalImage3Name: additional3?.name ?? null,
      additionalImage3MimeType: additional3?.mimeType ?? null,
      additionalImage3Size: additional3?.size ?? null,
      additionalImage3Data: additional3?.data ?? null,
      reservationMonthKey: input.reservation?.monthKey || null,
      reservationWeekKey: input.reservation?.weekKey || null,
      reservationStartsAt: parsedReservationStartsAt,
      orderContextJson: input.orderContext
        ? (JSON.parse(JSON.stringify(input.orderContext)) as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      formDataJson,
    },
  });
}
