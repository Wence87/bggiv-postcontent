import { NextRequest, NextResponse } from "next/server";
import { cleanupExpiredReservations, getOrCreateSubmissionDraft } from "@/lib/submissionService";
import { verifySubmitToken } from "@/lib/submitToken";

function unauthorized(code: string, message: string) {
  return NextResponse.json({ code, message }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ code: "BAD_REQUEST", message }, { status: 400 });
}

function parseToken(request: NextRequest): string | null {
  return request.nextUrl.searchParams.get("token");
}

export async function GET(request: NextRequest) {
  const token = parseToken(request);
  if (!token) {
    return badRequest("Missing token");
  }

  let payload;
  try {
    payload = verifySubmitToken(token);
  } catch (error) {
    const code = error instanceof Error ? error.message : "TOKEN_INVALID";
    return unauthorized(code, "Invalid token");
  }

  await cleanupExpiredReservations();
  const draft = await getOrCreateSubmissionDraft(payload);

  return NextResponse.json({
    draft: {
      orderId: draft.orderId,
      email: draft.email,
      productType: payload.product_type,
      durationWeeks: draft.durationWeeks,
      status: draft.status,
      title: draft.title,
      body: draft.body,
      booking: draft.booking
        ? {
            id: draft.booking.id,
            status: draft.booking.status,
            monthKey: draft.booking.monthKey,
            weekKey: draft.booking.weekKey,
            startsAtUtc: draft.booking.startsAtUtc?.toISOString() ?? null,
            expiresAt: draft.booking.expiresAt?.toISOString() ?? null,
          }
        : null,
    },
    meta: {
      tz: "Europe/Brussels",
      reservationExpiryHours: 12,
    },
  });
}
