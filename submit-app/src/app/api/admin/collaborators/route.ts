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

function urgencyBucket(createdAt: Date): "green" | "yellow" | "orange" | "red" {
  const minutes = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 60000));
  if (minutes <= 12 * 60) return "green";
  if (minutes <= 24 * 60) return "yellow";
  if (minutes <= 36 * 60) return "orange";
  return "red";
}

function computeStatusBuckets(editorialStatus: EditorialStatus, publicationStatus: PublicationStatus): {
  untouched: boolean;
  inProgress: boolean;
  publishedClosed: boolean;
} {
  const untouched = editorialStatus === EditorialStatus.SUBMITTED;
  const publishedClosed =
    publicationStatus === PublicationStatus.PUBLISHED ||
    publicationStatus === PublicationStatus.ARCHIVED ||
    editorialStatus === EditorialStatus.REJECTED;
  const inProgress = !untouched && !publishedClosed;
  return { untouched, inProgress, publishedClosed };
}

export async function GET(request: NextRequest) {
  const auth = await authenticateAdminRequestWithCollaborators(request);
  if (!auth) return unauthorized();
  if (!INTERNAL_ROLES.includes(auth.role)) return forbidden();

  const onlyActive = request.nextUrl.searchParams.get("active") !== "0";

  const collaborators = await prisma.collaborator.findMany({
    where: {
      role: { in: INTERNAL_ROLES },
      ...(onlyActive ? { isActive: true } : {}),
    },
    orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
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

  const collaboratorIds = collaborators.map((item) => item.id);
  const opsRows = collaboratorIds.length
    ? await prisma.submissionOps.findMany({
        where: { reviewerCollaboratorId: { in: collaboratorIds } },
        select: {
          reviewerCollaboratorId: true,
          editorialStatus: true,
          publicationStatus: true,
          submission: { select: { createdAt: true } },
        },
      })
    : [];

  const statsByCollaborator = new Map<string, {
    assigned: number;
    untouched: number;
    inProgress: number;
    publishedClosed: number;
    urgency: { green: number; yellow: number; orange: number; red: number };
  }>();

  for (const collaboratorId of collaboratorIds) {
    statsByCollaborator.set(collaboratorId, {
      assigned: 0,
      untouched: 0,
      inProgress: 0,
      publishedClosed: 0,
      urgency: { green: 0, yellow: 0, orange: 0, red: 0 },
    });
  }

  for (const row of opsRows) {
    const collaboratorId = row.reviewerCollaboratorId;
    if (!collaboratorId) continue;
    const stats = statsByCollaborator.get(collaboratorId);
    if (!stats) continue;

    stats.assigned += 1;
    const buckets = computeStatusBuckets(row.editorialStatus, row.publicationStatus);
    if (buckets.untouched) stats.untouched += 1;
    if (buckets.inProgress) stats.inProgress += 1;
    if (buckets.publishedClosed) stats.publishedClosed += 1;

    const urgency = urgencyBucket(row.submission.createdAt);
    stats.urgency[urgency] += 1;
  }

  const items = collaborators.map((collaborator) => ({
    ...collaborator,
    metrics: statsByCollaborator.get(collaborator.id) ?? {
      assigned: 0,
      untouched: 0,
      inProgress: 0,
      publishedClosed: 0,
      urgency: { green: 0, yellow: 0, orange: 0, red: 0 },
    },
  }));

  return NextResponse.json({ items, role: auth.role });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateAdminRequestWithCollaborators(request);
  if (!auth) return unauthorized();
  if (auth.role !== "SUPER_ADMIN") return forbidden();

  const body = (await request.json()) as Record<string, unknown>;
  const role = normalizeRole(body.role);
  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!role || !firstName || !lastName || !displayName || !email) {
    return NextResponse.json({ code: "BAD_REQUEST", message: "Missing required fields" }, { status: 400 });
  }

  const plainToken = generateToken();

  try {
    const created = await prisma.collaborator.create({
      data: {
        firstName,
        lastName,
        displayName,
        email,
        role,
        isActive: true,
        apiTokenHash: tokenHash(plainToken),
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
      },
    });

    return NextResponse.json({ item: created, plainToken }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ code: "CONFLICT", message: "A collaborator with this email already exists." }, { status: 409 });
    }
    return NextResponse.json({ code: "INTERNAL_SERVER_ERROR", message: "Unable to create collaborator." }, { status: 500 });
  }
}
