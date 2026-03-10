import { EditorialStatus, OrderPaymentStatus, PublicationStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  authenticateAdminRequest,
  buildSubmissionScopeWhere,
  canEditEditorial,
  canEditNotes,
  canEditPayment,
  canEditPublication,
} from "@/lib/adminAuth";
import { summarizeAssets, summarizePurchasedOptions } from "@/lib/adminSubmissions";

function unauthorized() {
  return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
}

function forbidden(message = "FORBIDDEN") {
  return NextResponse.json({ code: "FORBIDDEN", message }, { status: 403 });
}

function parseEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase() as T;
  return allowed.includes(normalized) ? normalized : null;
}

async function loadScopedSubmission(id: string, request: NextRequest) {
  const auth = authenticateAdminRequest(request);
  if (!auth) return { auth: null, submission: null };

  const submission = await prisma.submitFormSubmission.findFirst({
    where: {
      AND: [
        { id },
        buildSubmissionScopeWhere(auth),
      ],
    },
    include: {
      ops: true,
      auditEvents: {
        orderBy: { createdAt: "desc" },
        take: 100,
      },
    },
  });

  return { auth, submission };
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { auth, submission } = await loadScopedSubmission(id, request);

  if (!auth) return unauthorized();
  if (!submission) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });

  const formData = submission.formDataJson && typeof submission.formDataJson === "object"
    ? (submission.formDataJson as Record<string, unknown>)
    : {};
  const orderContext = submission.orderContextJson && typeof submission.orderContextJson === "object"
    ? (submission.orderContextJson as Record<string, unknown>)
    : {};

  const assets = summarizeAssets(submission);
  const hideInternal = auth.role === "PUBLISHER" || auth.role === "CLIENT_PRO";
  const canUpdateEditorial = canEditEditorial(auth.role);
  const canUpdatePublication = canEditPublication(auth.role);
  const canUpdatePayment = canEditPayment(auth.role);
  const canUpdateNotes = canEditNotes(auth.role);

  return NextResponse.json({
    id: submission.id,
    submission: {
      id: submission.id,
      productType: submission.productType,
      productKey: submission.productKey,
      companyName: submission.companyName,
      contactEmail: submission.contactEmail,
      linkedOrderId: submission.linkedOrderId,
      orderNumber: submission.orderNumber,
      reservationMonthKey: submission.reservationMonthKey,
      reservationWeekKey: submission.reservationWeekKey,
      reservationStartsAt: submission.reservationStartsAt?.toISOString() ?? null,
      createdAt: submission.createdAt.toISOString(),
      updatedAt: submission.updatedAt.toISOString(),
      purchasedOptionsSummary: summarizePurchasedOptions(submission),
      assets,
      bannerImageName: submission.bannerImageName,
      bannerImageMimeType: submission.bannerImageMimeType,
      bannerImageSize: submission.bannerImageSize,
      formData,
      orderContext,
    },
    workflow: {
      orderPaymentStatus: submission.ops?.orderPaymentStatus ?? OrderPaymentStatus.PAID,
      editorialStatus: submission.ops?.editorialStatus ?? EditorialStatus.SUBMITTED,
      publicationStatus: submission.ops?.publicationStatus ?? PublicationStatus.NOT_SCHEDULED,
      reviewerAssignee: submission.ops?.reviewerAssignee ?? "",
      clientVisibleNote: submission.ops?.clientVisibleNote ?? "",
      internalNote: hideInternal ? "" : submission.ops?.internalNote ?? "",
    },
    audit: submission.auditEvents
      .filter((event) => !(hideInternal && event.fieldName === "internalNote"))
      .map((event) => ({
      id: event.id,
      actorRole: event.actorRole,
      actorIdentifier: event.actorIdentifier,
      eventType: event.eventType,
      fieldName: event.fieldName,
      fromValue: event.fromValue,
      toValue: event.toValue,
      comment: event.comment,
      createdAt: event.createdAt.toISOString(),
    })),
    role: auth.role,
    permissions: {
      canUpdateEditorial,
      canUpdatePublication,
      canUpdatePayment,
      canUpdateNotes,
    },
  });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { auth, submission } = await loadScopedSubmission(id, request);
  if (!auth) return unauthorized();
  if (!submission) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });

  const payload = (await request.json()) as Record<string, unknown>;
  const editorialStatus = parseEnum(payload.editorialStatus, [
    "SUBMITTED",
    "UNDER_REVIEW",
    "CHANGES_REQUESTED",
    "APPROVED",
    "REJECTED",
  ] as const);
  const publicationStatus = parseEnum(payload.publicationStatus, [
    "NOT_SCHEDULED",
    "SCHEDULED",
    "PUBLISHED",
    "ARCHIVED",
  ] as const);
  const orderPaymentStatus = parseEnum(payload.orderPaymentStatus, ["PAID", "PENDING", "FAILED", "REFUNDED"] as const);

  const reviewerAssignee = typeof payload.reviewerAssignee === "string" ? payload.reviewerAssignee.trim() : null;
  const clientVisibleNote = typeof payload.clientVisibleNote === "string" ? payload.clientVisibleNote.trim() : null;
  const internalNote = typeof payload.internalNote === "string" ? payload.internalNote.trim() : null;
  const comment = typeof payload.comment === "string" ? payload.comment.trim() : null;

  if (editorialStatus && !canEditEditorial(auth.role)) {
    return forbidden("Role cannot update editorial status");
  }
  if (publicationStatus && !canEditPublication(auth.role)) {
    return forbidden("Role cannot update publication status");
  }
  if (orderPaymentStatus && !canEditPayment(auth.role)) {
    return forbidden("Role cannot update payment status");
  }
  if ((clientVisibleNote !== null || internalNote !== null) && !canEditNotes(auth.role)) {
    return forbidden("Role cannot edit notes");
  }

  const existingOps = submission.ops;

  const nextOpsData: {
    orderPaymentStatus?: OrderPaymentStatus;
    editorialStatus?: EditorialStatus;
    publicationStatus?: PublicationStatus;
    reviewerAssignee?: string | null;
    clientVisibleNote?: string | null;
    internalNote?: string | null;
  } = {};

  if (orderPaymentStatus) nextOpsData.orderPaymentStatus = orderPaymentStatus;
  if (editorialStatus) nextOpsData.editorialStatus = editorialStatus;
  if (publicationStatus) nextOpsData.publicationStatus = publicationStatus;
  if (reviewerAssignee !== null) nextOpsData.reviewerAssignee = reviewerAssignee || null;
  if (clientVisibleNote !== null) nextOpsData.clientVisibleNote = clientVisibleNote || null;
  if (internalNote !== null) nextOpsData.internalNote = internalNote || null;

  const noChanges = Object.keys(nextOpsData).length === 0 && !comment;
  if (noChanges) {
    return NextResponse.json({ code: "BAD_REQUEST", message: "No changes provided" }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const ops = await tx.submissionOps.upsert({
      where: { submissionId: submission.id },
      create: {
        submissionId: submission.id,
        ...nextOpsData,
      },
      update: {
        ...nextOpsData,
      },
    });

    const changes: Array<{ field: string; from: string | null; to: string | null }> = [];
    if (orderPaymentStatus && (existingOps?.orderPaymentStatus ?? OrderPaymentStatus.PAID) !== orderPaymentStatus) {
      changes.push({
        field: "orderPaymentStatus",
        from: existingOps?.orderPaymentStatus ?? OrderPaymentStatus.PAID,
        to: orderPaymentStatus,
      });
    }
    if (editorialStatus && (existingOps?.editorialStatus ?? EditorialStatus.SUBMITTED) !== editorialStatus) {
      changes.push({
        field: "editorialStatus",
        from: existingOps?.editorialStatus ?? EditorialStatus.SUBMITTED,
        to: editorialStatus,
      });
    }
    if (publicationStatus && (existingOps?.publicationStatus ?? PublicationStatus.NOT_SCHEDULED) !== publicationStatus) {
      changes.push({
        field: "publicationStatus",
        from: existingOps?.publicationStatus ?? PublicationStatus.NOT_SCHEDULED,
        to: publicationStatus,
      });
    }
    if (reviewerAssignee !== null && (existingOps?.reviewerAssignee ?? null) !== (reviewerAssignee || null)) {
      changes.push({ field: "reviewerAssignee", from: existingOps?.reviewerAssignee ?? null, to: reviewerAssignee || null });
    }
    if (clientVisibleNote !== null && (existingOps?.clientVisibleNote ?? null) !== (clientVisibleNote || null)) {
      changes.push({ field: "clientVisibleNote", from: existingOps?.clientVisibleNote ?? null, to: clientVisibleNote || null });
    }
    if (internalNote !== null && (existingOps?.internalNote ?? null) !== (internalNote || null)) {
      changes.push({ field: "internalNote", from: existingOps?.internalNote ?? null, to: internalNote || null });
    }

    for (const change of changes) {
      await tx.submissionAuditEvent.create({
        data: {
          submissionId: submission.id,
          actorRole: auth.role,
          actorIdentifier: auth.actor,
          eventType: "FIELD_UPDATED",
          fieldName: change.field,
          fromValue: change.from,
          toValue: change.to,
          comment: comment || null,
        },
      });
    }

    if (changes.length === 0 && comment) {
      await tx.submissionAuditEvent.create({
        data: {
          submissionId: submission.id,
          actorRole: auth.role,
          actorIdentifier: auth.actor,
          eventType: "COMMENT",
          comment,
        },
      });
    }

    return ops;
  });

  return NextResponse.json({ ok: true, workflow: updated });
}
