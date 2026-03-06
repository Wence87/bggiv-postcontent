import { NextRequest, NextResponse } from "next/server";
import { submitDraftContent } from "@/lib/submissionService";
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
  const title = typeof body.title === "string" ? body.title : "";
  const content = typeof body.body === "string" ? body.body : "";

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
    const draft = await submitDraftContent(payload, title, content);
    return NextResponse.json({
      draft: {
        orderId: draft.orderId,
        status: draft.status,
        title: draft.title,
        body: draft.body,
        bookingId: draft.bookingId,
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SUBMIT_FAILED";
    const status = code === "BOOKING_EXPIRED" ? 409 : 400;
    return NextResponse.json({ code }, { status });
  }
}
