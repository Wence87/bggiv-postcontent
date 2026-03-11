import { EditorialStatus, OrderPaymentStatus, PublicationStatus, type Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { authenticateAdminRequestWithCollaborators, buildSubmissionScopeWhere, canViewAllSubmissions } from "@/lib/adminAuth";
import { toListRow } from "@/lib/adminSubmissions";

function unauthorized() {
  return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function parseBoolFilter(value: string | null): boolean | null {
  if (value == null || value === "") return null;
  if (value === "1" || value.toLowerCase() === "true") return true;
  if (value === "0" || value.toLowerCase() === "false") return false;
  return null;
}

function parseOrderPaymentStatus(value: string | null): OrderPaymentStatus | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return normalized in OrderPaymentStatus ? (normalized as OrderPaymentStatus) : null;
}

function parseEditorialStatus(value: string | null): EditorialStatus | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return normalized in EditorialStatus ? (normalized as EditorialStatus) : null;
}

function parsePublicationStatus(value: string | null): PublicationStatus | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return normalized in PublicationStatus ? (normalized as PublicationStatus) : null;
}

export async function GET(request: NextRequest) {
  const auth = await authenticateAdminRequestWithCollaborators(request);
  if (!auth) return unauthorized();

  const params = request.nextUrl.searchParams;
  const limit = Math.min(200, Math.max(1, Number(params.get("limit") || "50")));
  const productType = params.get("productType")?.trim().toLowerCase() || null;
  const orderNumber = params.get("orderNumber")?.trim() || null;
  const company = params.get("company")?.trim() || null;
  const contactEmail = params.get("contactEmail")?.trim() || null;
  const reviewer = params.get("reviewer")?.trim() || null;
  const query = params.get("q")?.trim().toLowerCase() || null;

  const createdFrom = parseDate(params.get("createdFrom"));
  const createdTo = parseDate(params.get("createdTo"));
  const reservedFrom = parseDate(params.get("reservedFrom"));
  const reservedTo = parseDate(params.get("reservedTo"));
  const hasAssets = parseBoolFilter(params.get("hasAssets"));

  const paymentStatus = parseOrderPaymentStatus(params.get("paymentStatus"));
  const editorialStatus = parseEditorialStatus(params.get("editorialStatus"));
  const publicationStatus = parsePublicationStatus(params.get("publicationStatus"));

  const andWhere: Prisma.SubmitFormSubmissionWhereInput[] = [buildSubmissionScopeWhere(auth)];

  if (productType) {
    andWhere.push({ productType: { equals: productType, mode: "insensitive" } });
  }
  if (orderNumber) {
    andWhere.push({
      OR: [
        { orderNumber: { contains: orderNumber, mode: "insensitive" } },
        { linkedOrderId: { contains: orderNumber, mode: "insensitive" } },
      ],
    });
  }
  if (company) {
    andWhere.push({ companyName: { contains: company, mode: "insensitive" } });
  }
  if (contactEmail) {
    andWhere.push({ contactEmail: { contains: contactEmail, mode: "insensitive" } });
  }
  if (createdFrom || createdTo) {
    andWhere.push({
      createdAt: {
        gte: createdFrom ?? undefined,
        lte: createdTo ?? undefined,
      },
    });
  }
  if (reservedFrom || reservedTo) {
    andWhere.push({
      reservationStartsAt: {
        gte: reservedFrom ?? undefined,
        lte: reservedTo ?? undefined,
      },
    });
  }
  if (hasAssets === true) {
    andWhere.push({ bannerImageName: { not: "" } });
  }
  if (hasAssets === false) {
    andWhere.push({ bannerImageName: "" });
  }

  if (paymentStatus || editorialStatus || reviewer) {
    andWhere.push({
      ops: {
        is: {
          ...(paymentStatus ? { orderPaymentStatus: paymentStatus } : {}),
          ...(editorialStatus ? { editorialStatus } : {}),
          ...(reviewer ? { reviewerAssignee: { contains: reviewer, mode: "insensitive" } } : {}),
        },
      },
    });
  }

  if (query) {
    andWhere.push({
      OR: [
        { orderNumber: { contains: query, mode: "insensitive" } },
        { linkedOrderId: { contains: query, mode: "insensitive" } },
        { companyName: { contains: query, mode: "insensitive" } },
        { contactEmail: { contains: query, mode: "insensitive" } },
      ],
    });
  }

  const submissions = await prisma.submitFormSubmission.findMany({
    where: { AND: andWhere },
    include: { ops: true },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
  });

  const rows = submissions
    .filter((submission) => {
      if (!query) return true;
      const form = submission.formDataJson && typeof submission.formDataJson === "object" ? (submission.formDataJson as Record<string, unknown>) : {};
      const title = typeof form.title === "string" ? form.title.toLowerCase() : "";
      return title.includes(query) || submission.companyName.toLowerCase().includes(query) || submission.contactEmail.toLowerCase().includes(query);
    })
    .map(toListRow);

  const filteredRows = publicationStatus ? rows.filter((row) => row.publicationStatus === publicationStatus) : rows;

  return NextResponse.json({
    items: filteredRows,
    count: filteredRows.length,
    role: auth.role,
    scope: canViewAllSubmissions(auth.role) ? "all" : "own",
  });
}
