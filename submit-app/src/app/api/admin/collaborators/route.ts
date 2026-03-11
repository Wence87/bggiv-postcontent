import crypto from "crypto";
import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { authenticateAdminRequestWithCollaborators } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";

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
  return normalized as AdminRole;
}

export async function GET(request: NextRequest) {
  const auth = await authenticateAdminRequestWithCollaborators(request);
  if (!auth) return unauthorized();
  if (!["SUPER_ADMIN", "CONTENT_ADMIN", "OPS_ADMIN"].includes(auth.role)) return forbidden();

  const onlyActive = request.nextUrl.searchParams.get("active") !== "0";

  const collaborators = await prisma.collaborator.findMany({
    where: onlyActive ? { isActive: true } : undefined,
    orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      displayName: true,
      email: true,
      role: true,
      isActive: true,
      companyScope: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          assignedSubmissionOps: true,
        },
      },
    },
  });

  return NextResponse.json({ items: collaborators });
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
  const companyScope = typeof body.companyScope === "string" ? body.companyScope.trim() : "";

  if (!role || !firstName || !lastName || !displayName || !email) {
    return NextResponse.json({ code: "BAD_REQUEST", message: "Missing required fields" }, { status: 400 });
  }

  const plainToken = generateToken();

  const created = await prisma.collaborator.create({
    data: {
      firstName,
      lastName,
      displayName,
      email,
      role,
      isActive: true,
      apiTokenHash: tokenHash(plainToken),
      companyScope: companyScope || null,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      displayName: true,
      email: true,
      role: true,
      isActive: true,
      companyScope: true,
    },
  });

  return NextResponse.json({ item: created, plainToken }, { status: 201 });
}
