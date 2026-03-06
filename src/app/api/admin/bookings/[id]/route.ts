import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function unauthorized() {
  return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
}

function getProvidedAdminToken(request: NextRequest): string | null {
  const headerToken = request.headers.get("x-admin-token");
  if (headerToken) {
    return headerToken;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return request.nextUrl.searchParams.get("token");
}

function isAdminAuthorized(request: NextRequest): boolean {
  const expected = process.env.ADMIN_TOKEN;
  const provided = getProvidedAdminToken(request);

  return Boolean(expected) && provided === expected;
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!isAdminAuthorized(request)) {
    return unauthorized();
  }

  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ code: "BAD_REQUEST", message: "Missing booking id" }, { status: 400 });
  }

  try {
    await prisma.booking.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({ code: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
