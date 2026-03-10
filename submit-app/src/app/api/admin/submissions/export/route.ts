import { NextRequest, NextResponse } from "next/server";
import { EditorialStatus } from "@prisma/client";

import { authenticateAdminRequest, buildSubmissionScopeWhere, canDownloadExports } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";

function unauthorized() {
  return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
}

function toCsvRow(values: string[]): string {
  return values
    .map((value) => {
      const safe = value.replace(/\"/g, '""');
      return `"${safe}"`;
    })
    .join(",");
}

export async function GET(request: NextRequest) {
  const auth = authenticateAdminRequest(request);
  if (!auth) return unauthorized();
  if (!canDownloadExports(auth.role)) {
    return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  }

  const productType = request.nextUrl.searchParams.get("productType")?.trim().toLowerCase() || null;
  const editorialStatusRaw = request.nextUrl.searchParams.get("editorialStatus")?.trim().toUpperCase() || null;
  const editorialStatus =
    editorialStatusRaw && editorialStatusRaw in EditorialStatus ? (editorialStatusRaw as EditorialStatus) : null;

  const rows = await prisma.submitFormSubmission.findMany({
    where: {
      AND: [
        buildSubmissionScopeWhere(auth),
        ...(productType ? [{ productType: { equals: productType, mode: "insensitive" as const } }] : []),
        ...(editorialStatus
          ? [{ ops: { is: { editorialStatus } } }]
          : []),
      ],
    },
    include: { ops: true },
    orderBy: [{ createdAt: "desc" }],
    take: 1000,
  });

  const header = toCsvRow([
    "submission_id",
    "order_number",
    "linked_order_id",
    "product_type",
    "company",
    "contact_email",
    "payment_status",
    "editorial_status",
    "publication_status",
    "assignee",
    "created_at",
    "updated_at",
  ]);

  const csvRows = rows.map((row) =>
    toCsvRow([
      row.id,
      row.orderNumber || "",
      row.linkedOrderId || "",
      row.productType,
      row.companyName,
      row.contactEmail,
      row.ops?.orderPaymentStatus || "PAID",
      row.ops?.editorialStatus || "SUBMITTED",
      row.ops?.publicationStatus || "NOT_SCHEDULED",
      row.ops?.reviewerAssignee || "",
      row.createdAt.toISOString(),
      row.updatedAt.toISOString(),
    ])
  );

  const payload = [header, ...csvRows].join("\n");
  return new NextResponse(`${payload}\n`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"submissions-export.csv\"",
    },
  });
}
