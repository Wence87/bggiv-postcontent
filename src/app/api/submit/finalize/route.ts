import { NextRequest, NextResponse } from "next/server";
import { allowRateLimited, getClientIp, isAllowedOrigin } from "@/lib/apiSecurity";
import { fetchWPOrderContextByToken } from "@/lib/wpOrderContext";
import { saveAdsSubmissionWithDb } from "@/lib/finalizeSubmissionService";
import { getActiveReservationsByToken, tokenReservationRef } from "@/lib/submitReservationService";
import { BookingStatus, Product } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_IMAGE_SIZE_BYTES = 200 * 1024;
const ALLOWED_IMAGE_MIMES = new Set(["image/jpeg", "image/pjpeg"]);

function apiError(status: number, code: string, message: string) {
  return NextResponse.json({ code, message }, { status });
}

function badRequest(message: string) {
  return NextResponse.json({ code: "BAD_REQUEST", message }, { status: 400 });
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function hasValidJpegExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".jpg") || lower.endsWith(".jpeg");
}

function getJpegDimensions(buffer: Uint8Array): { width: number; height: number } | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const length = (buffer[offset + 2] << 8) | buffer[offset + 3];
    if (length < 2 || offset + 2 + length > buffer.length) {
      return null;
    }

    const isSof =
      marker === 0xc0 ||
      marker === 0xc1 ||
      marker === 0xc2 ||
      marker === 0xc3 ||
      marker === 0xc5 ||
      marker === 0xc6 ||
      marker === 0xc7 ||
      marker === 0xc9 ||
      marker === 0xca ||
      marker === 0xcb ||
      marker === 0xcd ||
      marker === 0xce ||
      marker === 0xcf;

    if (isSof) {
      const height = (buffer[offset + 5] << 8) | buffer[offset + 6];
      const width = (buffer[offset + 7] << 8) | buffer[offset + 8];
      return { width, height };
    }

    offset += 2 + length;
  }

  return null;
}

async function parseRequestPayload(request: NextRequest): Promise<{
  token: string;
  productKey: string;
  formData: Record<string, unknown>;
  reservationChoice: Record<string, unknown>;
  file: File | null;
}> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const token = normalizeString(form.get("token"));
    const productKey = normalizeString(form.get("product_key"));
    const formDataRaw = normalizeString(form.get("form_data"));
    const reservationRaw = normalizeString(form.get("reservation_choice"));
    let parsedFormData: Record<string, unknown> = {};
    let parsedReservation: Record<string, unknown> = {};
    if (formDataRaw) {
      try {
        const parsed = JSON.parse(formDataRaw) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          parsedFormData = parsed as Record<string, unknown>;
        }
      } catch {
        throw new Error("INVALID_FORM_DATA_JSON");
      }
    }
    if (reservationRaw) {
      try {
        const parsed = JSON.parse(reservationRaw) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          parsedReservation = parsed as Record<string, unknown>;
        }
      } catch {
        throw new Error("INVALID_RESERVATION_JSON");
      }
    }

    const maybeFile = form.get("banner_image_upload") ?? form.get("uploaded_files");
    const file = maybeFile instanceof File ? maybeFile : null;

    return { token, productKey, formData: parsedFormData, reservationChoice: parsedReservation, file };
  }

  const body = (await request.json()) as Record<string, unknown>;
  const token = normalizeString(body.token);
  const productKey = normalizeString(body.product_key);
  const formData = body.form_data && typeof body.form_data === "object" ? (body.form_data as Record<string, unknown>) : {};
  const reservationChoice =
    body.reservation_choice && typeof body.reservation_choice === "object"
      ? (body.reservation_choice as Record<string, unknown>)
      : {};
  const uploaded = body.uploaded_files as Record<string, unknown> | undefined;
  const file = uploaded && uploaded.banner_image_upload instanceof File ? uploaded.banner_image_upload : null;

  return { token, productKey, formData, reservationChoice, file };
}

function mapProductType(productType: string): Product {
  if (productType === "sponsorship") return Product.SPONSORSHIP;
  if (productType === "ads") return Product.ADS;
  if (productType === "promo") return Product.PROMO;
  if (productType === "giveaway") return Product.GIVEAWAY;
  return Product.NEWS;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);

  if (!isAllowedOrigin(request.headers)) {
    return apiError(403, "FORBIDDEN_ORIGIN", "Origin not allowed");
  }

  if (!allowRateLimited(`submit-finalize:${ip}`, 30, 15 * 60 * 1000)) {
    return apiError(429, "RATE_LIMITED", "Too many requests");
  }

  let parsed;
  try {
    parsed = await parseRequestPayload(request);
  } catch (parseError) {
    const code = parseError instanceof Error ? parseError.message : "INVALID_PAYLOAD";
    return badRequest(code);
  }

  const { token, productKey, formData, reservationChoice, file } = parsed;
  if (!token) {
    return badRequest("Missing token");
  }
  if (!productKey) {
    return badRequest("Missing product_key");
  }

  let context;
  try {
    context = await fetchWPOrderContextByToken(token);
  } catch (tokenError) {
    if (!allowRateLimited(`submit-finalize-invalid:${ip}`, 10, 15 * 60 * 1000)) {
      return apiError(429, "RATE_LIMITED", "Too many invalid attempts");
    }
    const code = tokenError instanceof Error ? tokenError.message : "TOKEN_INVALID";
    return apiError(401, code, "Invalid or expired token");
  }

  if (context.product.product_key !== productKey) {
    return apiError(403, "PRODUCT_MISMATCH", "Token and product key mismatch");
  }

  const companyName = normalizeString(formData.company_name);
  const contactEmail = normalizeString(formData.contact_email);
  const targetUrl = normalizeString(formData.target_url);
  const startDate = normalizeString(formData.start_date);
  const notes = normalizeString(formData.notes);
  const reservationMonthKey = normalizeString(reservationChoice.monthKey);
  const reservationWeekKey = normalizeString(reservationChoice.weekKey);
  const reservationStartsAt = normalizeString(reservationChoice.startsAtUtc);
  const reservationWeekKeys = Array.isArray(reservationChoice.weekKeys)
    ? reservationChoice.weekKeys.map((v) => normalizeString(v)).filter((v) => v.length > 0)
    : [];

  const prefilledCompanyName = normalizeString((context as { prefill?: { company_name?: string } }).prefill?.company_name);
  const prefilledContactEmail = normalizeString((context as { prefill?: { contact_email?: string } }).prefill?.contact_email);
  const effectiveCompanyName = prefilledCompanyName || companyName;
  const effectiveContactEmail = prefilledContactEmail || contactEmail;

  if (!effectiveCompanyName || !effectiveContactEmail || !targetUrl || !startDate) {
    return badRequest("Missing required form fields");
  }

  if (!isValidEmail(effectiveContactEmail)) {
    return badRequest("Invalid contact_email");
  }

  if (!file) {
    return badRequest("Missing banner_image_upload");
  }

  if (!ALLOWED_IMAGE_MIMES.has(file.type)) {
    return badRequest("Invalid image format. Only JPG/JPEG files are allowed.");
  }

  if (!hasValidJpegExtension(file.name || "")) {
    return badRequest("Invalid image format. Only JPG/JPEG files are allowed.");
  }

  if (file.size <= 0 || file.size > MAX_IMAGE_SIZE_BYTES) {
    return badRequest("Image too large. Maximum allowed size is 200 KB.");
  }

  const activeReservations = await getActiveReservationsByToken(token);
  if (!activeReservations.length) {
    return apiError(409, "RESERVATION_REQUIRED", "No active reservation found");
  }
  const activeReservation = activeReservations[0]!;

  const expectedProduct = mapProductType(context.product.product_type);
  if (activeReservation.product !== expectedProduct || activeReservations.some((r) => r.product !== expectedProduct)) {
    return apiError(409, "RESERVATION_PRODUCT_MISMATCH", "Reservation does not match product");
  }

  if (expectedProduct === Product.SPONSORSHIP && activeReservation.monthKey !== reservationMonthKey) {
    return apiError(409, "RESERVATION_MISMATCH", "Reserved month does not match");
  }
  if (expectedProduct === Product.ADS && activeReservation.weekKey !== reservationWeekKey) {
    return apiError(409, "RESERVATION_MISMATCH", "Reserved week does not match");
  }
  if (expectedProduct === Product.ADS) {
    const activeWeekKeys = activeReservations.map((entry) => entry.weekKey).filter((v): v is string => Boolean(v)).sort();
    if (reservationWeekKeys.length > 0) {
      const selectedSorted = [...reservationWeekKeys].sort();
      if (JSON.stringify(selectedSorted) !== JSON.stringify(activeWeekKeys)) {
        return apiError(409, "RESERVATION_MISMATCH", "Reserved weeks do not match");
      }
    }
  }
  if (
    (expectedProduct === Product.NEWS || expectedProduct === Product.PROMO || expectedProduct === Product.GIVEAWAY) &&
    activeReservation.startsAtUtc?.toISOString() !== reservationStartsAt
  ) {
    return apiError(409, "RESERVATION_MISMATCH", "Reserved slot does not match");
  }

  const imageBuffer = await file.arrayBuffer();
  const imageBytes = new Uint8Array(imageBuffer);
  const dimensions = getJpegDimensions(imageBytes);
  if (!dimensions || dimensions.width !== 680 || dimensions.height !== 680) {
    return badRequest("Invalid image dimensions. Required size is 680 × 680 px.");
  }

  try {
    const submission = await prisma.$transaction(async (tx) => {
      const saved = await saveAdsSubmissionWithDb(tx, {
        token,
        productKey,
        productType: context.product.product_type,
        companyName: effectiveCompanyName,
        contactEmail: effectiveContactEmail,
        websiteUrl: "",
        targetUrl,
        adFormat: "",
        startDate,
        notes,
        reservation: {
          monthKey: reservationMonthKey || undefined,
          weekKey: reservationWeekKey || undefined,
          startsAtUtc: reservationStartsAt || undefined,
        },
        bannerImage: {
          name: file.name || "banner-image",
          mimeType: file.type,
          size: file.size,
          data: imageBuffer,
        },
        formData,
      });

      const updated = await tx.booking.updateMany({
        where: {
          reservedByOrderId: tokenReservationRef(token),
          status: BookingStatus.DRAFT_RESERVED,
          product: expectedProduct,
        },
        data: {
          status: BookingStatus.SUBMITTED,
          expiresAt: null,
          companyName: effectiveCompanyName,
          customerEmail: effectiveContactEmail,
        },
      });
      if (updated.count < 1) {
        throw new Error("RESERVATION_STATE_CHANGED");
      }

      return saved;
    });

    return NextResponse.json({
      ok: true,
      submissionId: submission.id,
      redirectTo: "/submit/success",
    });
  } catch (storeError) {
    const code = storeError instanceof Error ? storeError.message : "SUBMIT_FAILED";
    return apiError(500, code, "Unable to store submission");
  }
}
