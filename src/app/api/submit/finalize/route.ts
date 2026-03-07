import { NextRequest, NextResponse } from "next/server";
import { allowRateLimited, getClientIp, isAllowedOrigin } from "@/lib/apiSecurity";
import { fetchWPOrderContextByToken } from "@/lib/wpOrderContext";
import { saveAdsSubmission } from "@/lib/finalizeSubmissionService";

export const runtime = "nodejs";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

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

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function parseRequestPayload(request: NextRequest): Promise<{
  token: string;
  productKey: string;
  formData: Record<string, unknown>;
  file: File | null;
}> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const token = normalizeString(form.get("token"));
    const productKey = normalizeString(form.get("product_key"));
    const formDataRaw = normalizeString(form.get("form_data"));
    let parsedFormData: Record<string, unknown> = {};
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

    const maybeFile = form.get("banner_image_upload") ?? form.get("uploaded_files");
    const file = maybeFile instanceof File ? maybeFile : null;

    return { token, productKey, formData: parsedFormData, file };
  }

  const body = (await request.json()) as Record<string, unknown>;
  const token = normalizeString(body.token);
  const productKey = normalizeString(body.product_key);
  const formData = body.form_data && typeof body.form_data === "object" ? (body.form_data as Record<string, unknown>) : {};
  const uploaded = body.uploaded_files as Record<string, unknown> | undefined;
  const file = uploaded && uploaded.banner_image_upload instanceof File ? uploaded.banner_image_upload : null;

  return { token, productKey, formData, file };
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

  const { token, productKey, formData, file } = parsed;
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
  const websiteUrl = normalizeString(formData.website_url);
  const targetUrl = normalizeString(formData.target_url);
  const adFormat = normalizeString(formData.ad_format);
  const startDate = normalizeString(formData.start_date);
  const notes = normalizeString(formData.notes);

  if (!companyName || !contactEmail || !websiteUrl || !targetUrl || !adFormat || !startDate) {
    return badRequest("Missing required form fields");
  }

  if (!isValidEmail(contactEmail)) {
    return badRequest("Invalid contact_email");
  }

  if (!isValidHttpUrl(websiteUrl) || !isValidHttpUrl(targetUrl)) {
    return badRequest("Invalid URL field");
  }

  if (!file) {
    return badRequest("Missing banner_image_upload");
  }

  if (!ALLOWED_IMAGE_MIMES.has(file.type)) {
    return badRequest("Unsupported image type");
  }

  if (file.size <= 0 || file.size > MAX_IMAGE_SIZE_BYTES) {
    return badRequest("Invalid image size");
  }

  const imageBuffer = await file.arrayBuffer();

  try {
    const submission = await saveAdsSubmission({
      token,
      productKey,
      productType: context.product.product_type,
      companyName,
      contactEmail,
      websiteUrl,
      targetUrl,
      adFormat,
      startDate,
      notes,
      bannerImage: {
        name: file.name || "banner-image",
        mimeType: file.type,
        size: file.size,
        data: imageBuffer,
      },
      formData,
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
