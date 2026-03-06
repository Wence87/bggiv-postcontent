import { NextRequest, NextResponse } from "next/server";
import { reserveDraftSlot } from "@/lib/submissionService";
import { verifySubmitToken } from "@/lib/submitToken";

function unauthorized(code: string, message: string) {
  return NextResponse.json({ code, message }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ code: "BAD_REQUEST", message }, { status: 400 });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const token = typeof body.token === "string" ? body.token : null;
  if (!token) {
    return badRequest("Missing token");
  }

  let payload;
  try {
    payload = verifySubmitToken(token);
  } catch (error) {
    const code = error instanceof Error ? error.message : "TOKEN_INVALID";
    return unauthorized(code, "Invalid or expired token");
  }

  try {
    const draft = await reserveDraftSlot(payload, {
      monthKey: typeof body.monthKey === "string" ? body.monthKey : undefined,
      weekKey: typeof body.weekKey === "string" ? body.weekKey : undefined,
      startsAtUtc: typeof body.startsAtUtc === "string" ? body.startsAtUtc : undefined,
    });

    return NextResponse.json({
      draft: {
        orderId: draft.orderId,
        status: draft.status,
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
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "RESERVATION_FAILED";
    const status = code === "MONTH_ALREADY_BOOKED" || code === "ADS_CAPACITY_REACHED" || code === "HOUR_ALREADY_BOOKED" || code === "POST_LEADTIME_LOCKED" || code === "PROMO_DAILY_LIMIT" || code === "GIVEAWAY_DAILY_LIMIT"
      ? 409
      : 400;
    return NextResponse.json({ code }, { status });
  }
}
