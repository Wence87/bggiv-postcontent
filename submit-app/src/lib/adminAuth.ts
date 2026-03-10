import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";

export type AdminRole = "SUPER_ADMIN" | "CONTENT_ADMIN" | "OPS_ADMIN" | "PUBLISHER" | "CLIENT_PRO";

export type AdminAuthContext = {
  role: AdminRole;
  actor: string;
  scopedEmail: string | null;
  scopedCompany: string | null;
};

type TokenConfigEntry = {
  role: AdminRole;
  token: string;
  email?: string;
  company?: string;
  actor?: string;
};

export function getProvidedAdminToken(request: NextRequest): string | null {
  const headerToken = request.headers.get("x-admin-token");
  if (headerToken) return headerToken;

  const authHeader = request.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return request.nextUrl.searchParams.get("token");
}

function parsePublisherTokenConfig(): TokenConfigEntry[] {
  const raw = process.env.PUBLISHER_CLIENT_TOKENS_JSON;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
      .map((entry) => {
        const roleRaw = typeof entry.role === "string" ? entry.role.trim().toUpperCase() : "PUBLISHER";
        const role = roleRaw === "CLIENT_PRO" ? "CLIENT_PRO" : "PUBLISHER";
        return {
          role,
          token: typeof entry.token === "string" ? entry.token.trim() : "",
          email: typeof entry.email === "string" ? entry.email.trim().toLowerCase() : undefined,
          company: typeof entry.company === "string" ? entry.company.trim().toLowerCase() : undefined,
          actor: typeof entry.actor === "string" ? entry.actor.trim() : undefined,
        } as TokenConfigEntry;
      })
      .filter((entry) => Boolean(entry.token));
  } catch {
    return [];
  }
}

function resolveTokenConfig(token: string): TokenConfigEntry | null {
  const superAdminTokens = [process.env.ADMIN_TOKEN, process.env.SUPER_ADMIN_TOKEN]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.trim());

  if (superAdminTokens.includes(token)) {
    return { role: "SUPER_ADMIN", token, actor: "super-admin" };
  }

  if (process.env.CONTENT_ADMIN_TOKEN && token === process.env.CONTENT_ADMIN_TOKEN.trim()) {
    return { role: "CONTENT_ADMIN", token, actor: "content-admin" };
  }

  if (process.env.OPS_ADMIN_TOKEN && token === process.env.OPS_ADMIN_TOKEN.trim()) {
    return { role: "OPS_ADMIN", token, actor: "ops-admin" };
  }

  const publisherConfig = parsePublisherTokenConfig();
  const matched = publisherConfig.find((entry) => entry.token === token);
  return matched ?? null;
}

export function authenticateAdminRequest(request: NextRequest): AdminAuthContext | null {
  const provided = getProvidedAdminToken(request);
  if (!provided) return null;

  const tokenConfig = resolveTokenConfig(provided.trim());
  if (!tokenConfig) return null;

  return {
    role: tokenConfig.role,
    actor: tokenConfig.actor || tokenConfig.email || tokenConfig.company || tokenConfig.role,
    scopedEmail: tokenConfig.email ?? null,
    scopedCompany: tokenConfig.company ?? null,
  };
}

export function canViewAllSubmissions(role: AdminRole): boolean {
  return role === "SUPER_ADMIN" || role === "CONTENT_ADMIN" || role === "OPS_ADMIN";
}

export function canEditEditorial(role: AdminRole): boolean {
  return role === "SUPER_ADMIN" || role === "CONTENT_ADMIN";
}

export function canEditPublication(role: AdminRole): boolean {
  return role === "SUPER_ADMIN" || role === "OPS_ADMIN";
}

export function canEditPayment(role: AdminRole): boolean {
  return role === "SUPER_ADMIN";
}

export function canEditNotes(role: AdminRole): boolean {
  return role === "SUPER_ADMIN" || role === "CONTENT_ADMIN" || role === "OPS_ADMIN";
}

export function canDownloadExports(role: AdminRole): boolean {
  return role === "SUPER_ADMIN" || role === "CONTENT_ADMIN" || role === "OPS_ADMIN" || role === "PUBLISHER" || role === "CLIENT_PRO";
}

export function buildSubmissionScopeWhere(auth: AdminAuthContext): Prisma.SubmitFormSubmissionWhereInput {
  if (canViewAllSubmissions(auth.role)) {
    return {};
  }

  const conditions: Prisma.SubmitFormSubmissionWhereInput[] = [];
  if (auth.scopedEmail) {
    conditions.push({ contactEmail: { equals: auth.scopedEmail, mode: "insensitive" } });
  }
  if (auth.scopedCompany) {
    conditions.push({ companyName: { equals: auth.scopedCompany, mode: "insensitive" } });
  }

  if (conditions.length === 0) {
    return { id: { equals: "__forbidden__" } };
  }

  return { OR: conditions };
}
