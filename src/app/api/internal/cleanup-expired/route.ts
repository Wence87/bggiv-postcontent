import { NextRequest, NextResponse } from "next/server";
import { cleanupExpiredReservations } from "@/lib/submissionService";

function unauthorized() {
  return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
}

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CLEANUP_CRON_SECRET;
  if (!expected) return false;
  const token = request.headers.get("x-cleanup-secret");
  return token === expected;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  const result = await cleanupExpiredReservations();
  return NextResponse.json({
    ok: true,
    ...result,
  });
}
