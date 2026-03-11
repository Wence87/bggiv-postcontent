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
  const companyScope = typeof body.companyScope === "string" ? body.companyScope.trim() : undefined;
  const isActive = typeof body.isActive === "boolean" ? body.isActive : undefined;
  const regenerateToken = body.regenerateToken === true;

  const plainToken = regenerateToken ? generateToken() : null;

  const updated = await prisma.collaborator.update({
    where: { id },
    data: {
      ...(role ? { role } : {}),
      ...(firstName !== undefined ? { firstName } : {}),
      ...(lastName !== undefined ? { lastName } : {}),
      ...(displayName !== undefined ? { displayName } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(companyScope !== undefined ? { companyScope: companyScope || null } : {}),
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
      companyScope: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ item: updated, plainToken });
}
