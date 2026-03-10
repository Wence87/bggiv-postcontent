import { NextRequest, NextResponse } from "next/server";

import { authenticateAdminRequest, buildSubmissionScopeWhere, canDownloadExports } from "@/lib/adminAuth";
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

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = authenticateAdminRequest(request);
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

  const format = (request.nextUrl.searchParams.get("format") || "json").toLowerCase();
  const orderPrefix = sanitizeFilename(submission.orderNumber || submission.linkedOrderId || submission.id);

  const payload = {
    submissionId: submission.id,
    linkedOrderId: submission.linkedOrderId,
    orderNumber: submission.orderNumber,
    productType: submission.productType,
    productKey: submission.productKey,
    companyName: submission.companyName,
    contactEmail: submission.contactEmail,
    reservationMonthKey: submission.reservationMonthKey,
    reservationWeekKey: submission.reservationWeekKey,
    reservationStartsAt: submission.reservationStartsAt?.toISOString() ?? null,
    createdAt: submission.createdAt.toISOString(),
    updatedAt: submission.updatedAt.toISOString(),
    workflow: submission.ops,
    formData: submission.formDataJson,
    orderContext: submission.orderContextJson,
  };
  const form = submission.formDataJson && typeof submission.formDataJson === "object"
    ? (submission.formDataJson as Record<string, unknown>)
    : {};
  const title = typeof form.title === "string" ? form.title : "";
  const shortDescription = typeof form.short_product_description === "string" ? form.short_product_description : "";
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
      "purchased_options_summary",
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
      purchasedOptionsSummary,
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
    const zip = createZip([
      {
        name: `${orderPrefix}-submission.json`,
        data: new TextEncoder().encode(JSON.stringify(payload, null, 2)),
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

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"${orderPrefix}-submission.json\"`,
    },
  });
}
