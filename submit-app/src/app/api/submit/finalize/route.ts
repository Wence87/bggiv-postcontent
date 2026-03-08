import { NextRequest, NextResponse } from "next/server";
import { allowRateLimited, getClientIp, isAllowedOrigin } from "@/lib/apiSecurity";
import { fetchWPOrderContextByToken } from "@/lib/wpOrderContext";
import { saveAdsSubmissionWithDb } from "@/lib/finalizeSubmissionService";
import { getActiveReservationsByToken, tokenReservationRef } from "@/lib/submitReservationService";
import { BookingStatus, Product } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const ADS_SPONSOR_IMAGE_MAX_SIZE_BYTES = 200 * 1024;
const POSTS_IMAGE_MAX_SIZE_BYTES = 500 * 1024;
const ALLOWED_JPEG_MIMES = new Set(["image/jpeg", "image/pjpeg"]);
const ALLOWED_POSTS_IMAGE_MIMES = new Set(["image/jpeg", "image/pjpeg", "image/webp"]);

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

function hasValidPostsImageExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".webp");
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "").trim();
}

function getDateKeyInBrussels(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function resolvePostBodyMaxLength(context: Record<string, unknown>): number | null {
  const derived = context.derived_values;
  if (!derived || typeof derived !== "object") return 1000;
  const direct = (derived as Record<string, unknown>).post_body_max_length;
  if (typeof direct === "number" && Number.isFinite(direct) && direct > 0) return Math.trunc(direct);
  if (direct === null) return null;
  const enabled = Array.isArray(context.enabled_options) ? context.enabled_options : [];
  if (
    enabled.some(
      (value) => typeof value === "string" && normalizeOptionKey(value).includes(normalizeOptionKey("extended_textlimit"))
    )
  ) {
    return null;
  }
  return 1000;
}

function normalizeOptionKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function resolveGiveawayDurationDays(context: Record<string, unknown>): number {
  const reservation = context.reservation;
  if (reservation && typeof reservation === "object") {
    const weeksRaw = (reservation as Record<string, unknown>).giveaway_duration_weeks;
    const weeks =
      typeof weeksRaw === "number"
        ? weeksRaw
        : typeof weeksRaw === "string"
          ? Number.parseInt(weeksRaw, 10)
          : NaN;
    if (Number.isFinite(weeks) && weeks >= 1 && weeks <= 4) return weeks * 7;
  }
  const derived = context.derived_values;
  if (derived && typeof derived === "object") {
    const map = derived as Record<string, unknown>;
    const directDays = map.giveaway_duration_days;
    if (typeof directDays === "number" && [7, 14, 21, 28].includes(directDays)) return directDays;
    if (typeof directDays === "string") {
      const parsedDays = Number.parseInt(directDays, 10);
      if ([7, 14, 21, 28].includes(parsedDays)) return parsedDays;
    }
    const directWeeks = map.giveaway_duration_weeks;
    if (typeof directWeeks === "number" && directWeeks >= 1 && directWeeks <= 4) return directWeeks * 7;
    if (typeof directWeeks === "string") {
      const parsedWeeks = Number.parseInt(directWeeks, 10);
      if (parsedWeeks >= 1 && parsedWeeks <= 4) return parsedWeeks * 7;
    }

    for (const [key, value] of Object.entries(map)) {
      if (!key.toLowerCase().includes("duration")) continue;
      if (typeof value === "number" && value >= 1 && value <= 4) return value * 7;
      if (typeof value === "number" && [7, 14, 21, 28].includes(value)) return value;
      if (typeof value === "string") {
        const cleaned = value.toLowerCase();
        const dayMatch = /(\d{1,2})\s*day/.exec(cleaned);
        if (dayMatch) {
          const days = Number(dayMatch[1]);
          if ([7, 14, 21, 28].includes(days)) return days;
        }
        const weekMatch = /([1-4])\s*week/.exec(cleaned);
        if (weekMatch) return Number(weekMatch[1]) * 7;
      }
      if (value && typeof value === "object") {
        const finalValue = (value as Record<string, unknown>).duration_weeks_final;
        if (typeof finalValue === "number" && finalValue >= 1 && finalValue <= 4) return finalValue * 7;
        const finalDays = (value as Record<string, unknown>).duration_days_final;
        if (typeof finalDays === "number" && [7, 14, 21, 28].includes(finalDays)) return finalDays;
        const genericFinal = (value as Record<string, unknown>).final;
        if (typeof genericFinal === "number" && [7, 14, 21, 28].includes(genericFinal)) return genericFinal;
      }
    }
  }

  const enabledOptions = Array.isArray(context.enabled_options) ? context.enabled_options : [];
  for (const raw of enabledOptions) {
    if (typeof raw !== "string") continue;
    const normalized = normalizeOptionKey(raw);
    if (!normalized.includes("duration")) continue;
    const weekMatch = /([1-4])week/.exec(normalized);
    if (weekMatch) return Number(weekMatch[1]) * 7;
    const dayMatch = /(7|14|21|28)day/.exec(normalized);
    if (dayMatch) return Number(dayMatch[1]);
  }
  return 7;
}

function parseJsonStringArray(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

function computeUnlockedHighlights(units: number): number {
  if (units >= 20) return 3;
  if (units >= 10) return 2;
  if (units >= 5) return 1;
  return 0;
}

function monthKeyToRange(monthKey: string): { startDate: string; endDate: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month, 0));
  return {
    startDate: `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}-${String(first.getUTCDate()).padStart(2, "0")}`,
    endDate: `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, "0")}-${String(last.getUTCDate()).padStart(2, "0")}`,
  };
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
  additionalFiles: File[];
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

    const maybeFile = form.get("banner_image_upload") ?? form.get("cover_image_upload") ?? form.get("uploaded_files");
    const file = maybeFile instanceof File ? maybeFile : null;
    const additionalFiles: File[] = [];
    for (const key of ["additional_image_1", "additional_image_2", "additional_image_3"]) {
      const value = form.get(key);
      if (value instanceof File) additionalFiles.push(value);
    }

    return { token, productKey, formData: parsedFormData, reservationChoice: parsedReservation, file, additionalFiles };
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

  return { token, productKey, formData, reservationChoice, file, additionalFiles: [] };
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

  const { token, productKey, formData, reservationChoice, file, additionalFiles } = parsed;
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
  const title = normalizeString(formData.title);
  const body = normalizeString(formData.body);
  const bodyText = stripHtml(body);
  const shortProductDescription = normalizeString(formData.short_product_description);
  const prizeShortDescription = normalizeString(formData.prize_short_description);
  const embeddedVideoLink = normalizeString(formData.embedded_video_link);
  const prizeName = normalizeString(formData.prize_name);
  const giveawayCategory = normalizeString(formData.giveaway_category);
  const giveawayQuestion = normalizeString(formData.giveaway_question);
  const answerCorrect = normalizeString(formData.answer_correct);
  const answerWrong1 = normalizeString(formData.answer_wrong_1);
  const answerWrong2 = normalizeString(formData.answer_wrong_2);
  const answerWrong3 = normalizeString(formData.answer_wrong_3);
  const answerWrong4 = normalizeString(formData.answer_wrong_4);
  const targetUrl = normalizeString(formData.target_url);
  const startDate = normalizeString(formData.start_date);
  const notes = normalizeString(formData.notes);
  const prizeUnitsCount = Number(normalizeString(formData.prize_units_count));
  const prizeUnitValueUsd = Number(normalizeString(formData.prize_unit_value_usd));
  const minimumAge = Number(normalizeString(formData.minimum_age));
  const shippingCountries = parseJsonStringArray(formData.shipping_countries);
  const selectedHighlightOptions = parseJsonStringArray(formData.selected_highlight_options);
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
  let effectiveStartDate = startDate;
  let effectiveEndDate = normalizeString(formData.end_date);
  const isPostsProduct =
    context.product.product_type === "news" ||
    context.product.product_type === "promo" ||
    context.product.product_type === "giveaway";
  const isGiveaway = context.product.product_type === "giveaway";

  if (!effectiveCompanyName || !effectiveContactEmail) {
    return badRequest("Missing required form fields");
  }

  if (!isPostsProduct && !targetUrl) {
    return badRequest("Missing required form fields");
  }

  if (!isValidEmail(effectiveContactEmail)) {
    return badRequest("Invalid contact_email");
  }

  if (isPostsProduct) {
    if (!title || title.length > 150) {
      return badRequest("Title is invalid. Maximum allowed length is 150 characters.");
    }
    if (!bodyText) {
      return badRequest("Missing required body");
    }
    const bodyMax = resolvePostBodyMaxLength(context as unknown as Record<string, unknown>);
    if (bodyMax != null && bodyText.length > bodyMax) {
      return badRequest(`Body is too long. Maximum allowed length is ${bodyMax} characters.`);
    }
    if (shortProductDescription.length < 100 || shortProductDescription.length > 300) {
      return badRequest("Short product description must be between 100 and 300 characters.");
    }
    if (embeddedVideoLink) {
      try {
        const parsedUrl = new URL(embeddedVideoLink);
        if (!parsedUrl.protocol.startsWith("http")) throw new Error("INVALID_VIDEO");
      } catch {
        return badRequest("Invalid embedded video link.");
      }
    }
    for (const image of additionalFiles) {
      if (!ALLOWED_POSTS_IMAGE_MIMES.has(image.type) || !hasValidPostsImageExtension(image.name || "")) {
        return badRequest("Invalid image format. Only WEBP/JPG/JPEG files are allowed.");
      }
      if (image.size <= 0 || image.size > POSTS_IMAGE_MAX_SIZE_BYTES) {
        return badRequest("Image too large. Maximum allowed size is 500 KB.");
      }
    }
  }

  if (isGiveaway) {
    if (!prizeName || !prizeShortDescription || !giveawayCategory || !giveawayQuestion || !answerCorrect || !answerWrong1 || !answerWrong2 || !answerWrong3 || !answerWrong4) {
      return badRequest("Missing required giveaway fields");
    }
    if (prizeName.length > 150) {
      return badRequest("Prize name is too long. Maximum allowed length is 150 characters.");
    }
    if (prizeShortDescription.length > 300) {
      return badRequest("Prize short description is too long. Maximum allowed length is 300 characters.");
    }
    if (
      giveawayQuestion.length > 150 ||
      answerCorrect.length > 150 ||
      answerWrong1.length > 150 ||
      answerWrong2.length > 150 ||
      answerWrong3.length > 150 ||
      answerWrong4.length > 150
    ) {
      return badRequest("Giveaway question and answers must be 150 characters maximum.");
    }
    if (!Number.isFinite(prizeUnitValueUsd) || prizeUnitValueUsd < 10 || prizeUnitValueUsd > 700) {
      return badRequest("Prize value must be between 10 and 700 USD.");
    }
    if (!Number.isFinite(prizeUnitsCount) || prizeUnitsCount < 2 || prizeUnitsCount > 20) {
      return badRequest("Number of prize units must be between 2 and 20.");
    }
    if (!Number.isFinite(minimumAge) || minimumAge < 14) {
      return badRequest("Minimum age is invalid.");
    }
    if (shippingCountries.length < 1) {
      return badRequest("You must select at least one destination where the prize can be shipped.");
    }
    const unlocked = computeUnlockedHighlights(prizeUnitsCount);
    if (selectedHighlightOptions.length > unlocked) {
      return badRequest("Selected free highlight options exceed unlocked quantity.");
    }
  }

  if (!file) {
    return badRequest("Missing banner_image_upload");
  }

  const allowedMimes = isPostsProduct ? ALLOWED_POSTS_IMAGE_MIMES : ALLOWED_JPEG_MIMES;
  const hasValidExtension = isPostsProduct ? hasValidPostsImageExtension(file.name || "") : hasValidJpegExtension(file.name || "");
  const maxSize = isPostsProduct ? POSTS_IMAGE_MAX_SIZE_BYTES : ADS_SPONSOR_IMAGE_MAX_SIZE_BYTES;
  if (!allowedMimes.has(file.type) || !hasValidExtension) {
    return badRequest(
      isPostsProduct
        ? "Invalid image format. Only WEBP/JPG/JPEG files are allowed."
        : "Invalid image format. Only JPG/JPEG files are allowed."
    );
  }

  if (file.size <= 0 || file.size > maxSize) {
    return badRequest(
      isPostsProduct
        ? "Image too large. Maximum allowed size is 500 KB."
        : "Image too large. Maximum allowed size is 200 KB."
    );
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

  if (expectedProduct === Product.SPONSORSHIP) {
    const range = reservationMonthKey ? monthKeyToRange(reservationMonthKey) : null;
    if (!range) {
      return badRequest("Missing or invalid reservation month");
    }
    effectiveStartDate = range.startDate;
    effectiveEndDate = range.endDate;
  }
  if (isPostsProduct) {
    if (!reservationStartsAt) {
      return badRequest("Missing reservation slot");
    }
    const startsAt = new Date(reservationStartsAt);
    if (Number.isNaN(startsAt.getTime())) {
      return badRequest("Invalid reservation slot");
    }
    effectiveStartDate = getDateKeyInBrussels(startsAt);
    effectiveEndDate = "";
    if (isGiveaway) {
      const durationDays = resolveGiveawayDurationDays(context as unknown as Record<string, unknown>);
      const end = new Date(startsAt);
      end.setUTCDate(end.getUTCDate() + durationDays);
      effectiveEndDate = getDateKeyInBrussels(end);
    }
  }
  if (!effectiveStartDate) {
    return badRequest("Missing required start_date");
  }

  const imageBuffer = await file.arrayBuffer();
  if (expectedProduct === Product.ADS) {
    const imageBytes = new Uint8Array(imageBuffer);
    const dimensions = getJpegDimensions(imageBytes);
    if (!dimensions || dimensions.width !== 680 || dimensions.height !== 680) {
      return badRequest("Invalid image dimensions. Required size is 680 × 680 px.");
    }
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
        targetUrl: isPostsProduct ? "" : targetUrl,
        adFormat: "",
        startDate: effectiveStartDate,
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
        formData: {
          ...formData,
          title: title || undefined,
          body: body || undefined,
          short_product_description: shortProductDescription || undefined,
          prize_short_description: prizeShortDescription || undefined,
          embedded_video_link: embeddedVideoLink || undefined,
          shipping_countries: shippingCountries,
          selected_highlight_options: selectedHighlightOptions,
          start_date: effectiveStartDate,
          end_date: effectiveEndDate || undefined,
        },
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
