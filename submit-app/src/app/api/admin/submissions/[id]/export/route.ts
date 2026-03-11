import { NextRequest, NextResponse } from "next/server";

import { authenticateAdminRequestWithCollaborators, buildSubmissionScopeWhere, canDownloadExports } from "@/lib/adminAuth";
import { formatReservedSlot, summarizePurchasedOptions } from "@/lib/adminSubmissions";
import { prisma } from "@/lib/prisma";
import { createZip } from "@/lib/zip";

function unauthorized() {
  return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function toCsvRow(values: string[]): string {
  return values
    .map((value) => {
      const safe = value.replace(/\"/g, '""');
      return `"${safe}"`;
    })
    .join(",");
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authenticateAdminRequestWithCollaborators(request);
  if (!auth) return unauthorized();
  if (!canDownloadExports(auth.role)) {
    return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await context.params;
  const submission = await prisma.submitFormSubmission.findFirst({
    where: {
      AND: [{ id }, buildSubmissionScopeWhere(auth)],
    },
    include: {
      ops: true,
    },
  });
  if (!submission) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });

  const format = (request.nextUrl.searchParams.get("format") || "package").toLowerCase();
  const orderPrefix = sanitizeFilename(submission.orderNumber || submission.linkedOrderId || submission.id);

  const form = submission.formDataJson && typeof submission.formDataJson === "object"
    ? (submission.formDataJson as Record<string, unknown>)
    : {};
  const title = typeof form.title === "string" ? form.title : "";
  const shortDescription = typeof form.short_product_description === "string" ? form.short_product_description : "";
  const body = typeof form.body === "string" ? form.body : "";
  const notesToAdmin = typeof form.notes === "string" ? form.notes : "";
  const giveawayDetails = [
    asString(form.prize_name),
    asString(form.giveaway_category),
    asString(form.prize_units_count),
    asString(form.prize_unit_value_usd),
  ]
    .filter(Boolean)
    .join(" | ");
  const quizQuestion = asString(form.giveaway_question);
  const quizAnswers = [
    asString(form.answer_correct),
    asString(form.answer_wrong_1),
    asString(form.answer_wrong_2),
    asString(form.answer_wrong_3),
    asString(form.answer_wrong_4),
  ]
    .filter(Boolean)
    .join(" | ");
  const shippingCountries = asStringArray(form.shipping_countries).join(", ");
  const audienceAmplifier = form.audience_amplifier_actions && typeof form.audience_amplifier_actions === "object"
    ? JSON.stringify(form.audience_amplifier_actions)
    : "";
  const purchasedOptionsSummary = summarizePurchasedOptions(submission);
  const reservedSlot = formatReservedSlot(submission);

  if (format === "csv") {
    const header = toCsvRow([
      "submission_id",
      "order_number",
      "linked_order_id",
      "product_type",
      "company",
      "contact_email",
      "reservation_month_key",
      "reservation_week_key",
      "reservation_starts_at",
      "payment_status",
      "editorial_status",
      "publication_status",
      "assignee",
      "reserved_slot",
      "title",
      "short_description",
      "body",
      "notes_to_admin",
      "purchased_options_summary",
      "giveaway_details",
      "quiz_question",
      "quiz_answers",
      "shipping_countries",
      "audience_amplifier_configuration",
      "created_at",
      "updated_at",
    ]);
    const row = toCsvRow([
      submission.id,
      submission.orderNumber || "",
      submission.linkedOrderId || "",
      submission.productType,
      submission.companyName,
      submission.contactEmail,
      submission.reservationMonthKey || "",
      submission.reservationWeekKey || "",
      submission.reservationStartsAt?.toISOString() || "",
      submission.ops?.orderPaymentStatus || "PAID",
      submission.ops?.editorialStatus || "SUBMITTED",
      submission.ops?.publicationStatus || "NOT_SCHEDULED",
      submission.ops?.reviewerAssignee || "",
      reservedSlot,
      title,
      shortDescription,
      body,
      notesToAdmin,
      purchasedOptionsSummary,
      giveawayDetails,
      quizQuestion,
      quizAnswers,
      shippingCountries,
      audienceAmplifier,
      submission.createdAt.toISOString(),
      submission.updatedAt.toISOString(),
    ]);

    return new NextResponse(`${header}\n${row}\n`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"${orderPrefix}-submission.csv\"`,
      },
    });
  }

  if (format === "package") {
    const packageHeader = toCsvRow([
      "submission_id",
      "order_number",
      "linked_order_id",
      "product_type",
      "company",
      "contact_email",
      "reserved_slot",
      "payment_status",
      "editorial_status",
      "publication_status",
      "reviewer_assignee",
      "title",
      "short_product_description",
      "body",
      "notes_to_admin",
      "purchased_options_summary",
      "giveaway_details",
      "quiz_question",
      "quiz_answers",
      "shipping_countries",
      "audience_amplifier_configuration",
      "created_at",
      "updated_at",
    ]);
    const packageRow = toCsvRow([
      submission.id,
      submission.orderNumber || "",
      submission.linkedOrderId || "",
      submission.productType,
      submission.companyName,
      submission.contactEmail,
      reservedSlot,
      submission.ops?.orderPaymentStatus || "PAID",
      submission.ops?.editorialStatus || "SUBMITTED",
      submission.ops?.publicationStatus || "NOT_SCHEDULED",
      submission.ops?.reviewerAssignee || "",
      title,
      shortDescription,
      body,
      notesToAdmin,
      purchasedOptionsSummary,
      giveawayDetails,
      quizQuestion,
      quizAnswers,
      shippingCountries,
      audienceAmplifier,
      submission.createdAt.toISOString(),
      submission.updatedAt.toISOString(),
    ]);

    const zip = createZip([
      {
        name: `${orderPrefix}-submission.csv`,
        data: new TextEncoder().encode(`${packageHeader}\n${packageRow}\n`),
        modifiedAt: submission.updatedAt,
      },
      {
        name: `${orderPrefix}-cover-${sanitizeFilename(submission.bannerImageName || "asset.jpg")}`,
        data: new Uint8Array(submission.bannerImageData),
        modifiedAt: submission.updatedAt,
      },
      ...(submission.additionalImage1Data
        ? [
            {
              name: `${orderPrefix}-image1-${sanitizeFilename(submission.additionalImage1Name || "image1")}`,
              data: new Uint8Array(submission.additionalImage1Data),
              modifiedAt: submission.updatedAt,
            },
          ]
        : []),
      ...(submission.additionalImage2Data
        ? [
            {
              name: `${orderPrefix}-image2-${sanitizeFilename(submission.additionalImage2Name || "image2")}`,
              data: new Uint8Array(submission.additionalImage2Data),
              modifiedAt: submission.updatedAt,
            },
          ]
        : []),
      ...(submission.additionalImage3Data
        ? [
            {
              name: `${orderPrefix}-image3-${sanitizeFilename(submission.additionalImage3Name || "image3")}`,
              data: new Uint8Array(submission.additionalImage3Data),
              modifiedAt: submission.updatedAt,
            },
          ]
        : []),
    ]);

    return new NextResponse(Buffer.from(zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename=\"${orderPrefix}-submission-package.zip\"`,
      },
    });
  }

  return NextResponse.json({ code: "BAD_REQUEST", message: "Supported formats: csv, package" }, { status: 400 });
}
