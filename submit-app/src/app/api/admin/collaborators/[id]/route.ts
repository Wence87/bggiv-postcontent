import crypto from "crypto";
import { AdminRole, EditorialStatus, Prisma, PublicationStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { authenticateAdminRequestWithCollaborators } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";

const INTERNAL_ROLES: AdminRole[] = ["SUPER_ADMIN", "CONTENT_ADMIN", "OPS_ADMIN"];

function unauthorized() {
  return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
}

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateToken(): string {
  return `bgg_collab_${crypto.randomBytes(18).toString("hex")}`;
}

function normalizeRole(value: unknown): AdminRole | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (!(normalized in AdminRole)) return null;
  const role = normalized as AdminRole;
  return INTERNAL_ROLES.includes(role) ? role : null;
}

function urgency(createdAt: Date): { label: string; bucket: "green" | "yellow" | "orange" | "red"; minutes: number } {
  const minutes = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 60000));
  const label = minutes < 60 ? `${minutes}m` : minutes < 24 * 60 ? `${Math.floor(minutes / 60)}h` : `${Math.floor(minutes / (24 * 60))}d`;
  if (minutes <= 12 * 60) return { label, bucket: "green", minutes };
  if (minutes <= 24 * 60) return { label, bucket: "yellow", minutes };
  if (minutes <= 36 * 60) return { label, bucket: "orange", minutes };
  return { label, bucket: "red", minutes };
}

function derivePendingAction(editorialStatus: EditorialStatus, publicationStatus: PublicationStatus): { label: string; owner: "ADMIN" | "CLIENT" | "OPS" } {
  if (editorialStatus === EditorialStatus.REJECTED) return { label: "Rejected", owner: "ADMIN" };
  if (editorialStatus === EditorialStatus.CHANGES_REQUESTED) return { label: "Waiting for client updates", owner: "CLIENT" };
  if (editorialStatus === EditorialStatus.APPROVED && publicationStatus !== PublicationStatus.PUBLISHED) {
    return { label: "Ready for publication workflow", owner: "OPS" };
  }
  if (publicationStatus === PublicationStatus.PUBLISHED) return { label: "Published", owner: "OPS" };
  return { label: "Pending admin review", owner: "ADMIN" };
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authenticateAdminRequestWithCollaborators(request);
  if (!auth) return unauthorized();
  if (!INTERNAL_ROLES.includes(auth.role)) return forbidden();

  const { id } = await context.params;

  const collaborator = await prisma.collaborator.findFirst({
    where: { id, role: { in: INTERNAL_ROLES } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      displayName: true,
      email: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!collaborator) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });

  const assignments = await prisma.submissionOps.findMany({
    where: { reviewerCollaboratorId: id },
    orderBy: [{ updatedAt: "desc" }],
    include: {
      submission: {
        select: {
          id: true,
          orderNumber: true,
          linkedOrderId: true,
          productType: true,
          companyName: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  const rows = assignments.map((row) => {
    const u = urgency(row.submission.createdAt);
    const pending = derivePendingAction(row.editorialStatus, row.publicationStatus);
    return {
      submissionId: row.submission.id,
      orderNumber: row.submission.orderNumber || row.submission.linkedOrderId || "-",
      productType: row.submission.productType,
      company: row.submission.companyName,
      editorialStatus: row.editorialStatus,
      publicationStatus: row.publicationStatus,
      pendingAction: pending,
      urgency: u,
      createdAt: row.submission.createdAt.toISOString(),
      updatedAt: row.submission.updatedAt.toISOString(),
    };
  });

  const metrics = {
    assigned: rows.length,
    untouched: rows.filter((row) => row.editorialStatus === "SUBMITTED").length,
    inProgress: rows.filter((row) => row.editorialStatus !== "SUBMITTED" && row.publicationStatus !== "PUBLISHED" && row.publicationStatus !== "ARCHIVED" && row.editorialStatus !== "REJECTED").length,
    publishedClosed: rows.filter((row) => row.publicationStatus === "PUBLISHED" || row.publicationStatus === "ARCHIVED" || row.editorialStatus === "REJECTED").length,
    urgency: {
      green: rows.filter((row) => row.urgency.bucket === "green").length,
      yellow: rows.filter((row) => row.urgency.bucket === "yellow").length,
      orange: rows.filter((row) => row.urgency.bucket === "orange").length,
      red: rows.filter((row) => row.urgency.bucket === "red").length,
    },
  };

  return NextResponse.json({ collaborator, metrics, assignments: rows });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authenticateAdminRequestWithCollaborators(request);
  if (!auth) return unauthorized();
  if (auth.role !== "SUPER_ADMIN") return forbidden();

  const { id } = await context.params;
  const body = (await request.json()) as Record<string, unknown>;

  const role = body.role !== undefined ? normalizeRole(body.role) : undefined;
  if (body.role !== undefined && !role) {
    return NextResponse.json({ code: "BAD_REQUEST", message: "Invalid role" }, { status: 400 });
  }

  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : undefined;
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : undefined;
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : undefined;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : undefined;
  const isActive = typeof body.isActive === "boolean" ? body.isActive : undefined;
  const regenerateToken = body.regenerateToken === true;

  const plainToken = regenerateToken ? generateToken() : null;

  try {
    const updated = await prisma.collaborator.update({
      where: { id },
      data: {
        ...(role ? { role } : {}),
        ...(firstName !== undefined ? { firstName } : {}),
        ...(lastName !== undefined ? { lastName } : {}),
        ...(displayName !== undefined ? { displayName } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(plainToken ? { apiTokenHash: tokenHash(plainToken) } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        displayName: true,
        email: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ item: updated, plainToken });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ code: "NOT_FOUND", message: "Collaborator not found." }, { status: 404 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ code: "CONFLICT", message: "A collaborator with this email already exists." }, { status: 409 });
    }
    return NextResponse.json({ code: "INTERNAL_SERVER_ERROR", message: "Unable to update collaborator." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authenticateAdminRequestWithCollaborators(request);
  if (!auth) return unauthorized();
  if (auth.role !== "SUPER_ADMIN") return forbidden();

  const { id } = await context.params;

  const collaborator = await prisma.collaborator.findFirst({
    where: { id, role: { in: INTERNAL_ROLES } },
    select: { id: true, displayName: true },
  });
  if (!collaborator) {
    return NextResponse.json({ code: "NOT_FOUND", message: "Collaborator not found." }, { status: 404 });
  }

  const assignedCount = await prisma.submissionOps.count({
    where: { reviewerCollaboratorId: id },
  });
  if (assignedCount > 0) {
    return NextResponse.json(
      {
        code: "CONFLICT",
        message: "This collaborator still has assigned submissions. Reassign or clear them before deletion.",
        assignedCount,
      },
      { status: 409 }
    );
  }

  await prisma.collaborator.delete({
    where: { id },
  });

  return NextResponse.json({ ok: true, deletedId: id, deletedDisplayName: collaborator.displayName });
}
