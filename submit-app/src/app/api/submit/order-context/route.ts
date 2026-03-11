import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSubmissionEditToken, verifySubmissionEditToken } from "@/lib/submissionEditToken";

const WP_BASE_URL = (process.env.NEXT_PUBLIC_WP_BASE_URL || "https://boardgamegiveaways.com").replace(/\/$/, "");

function parseJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text.slice(0, 1000) };
  }
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim() || "";
  const diag = request.nextUrl.searchParams.get("diag") === "1";
  if (!token) {
    return NextResponse.json({ code: "missing_token", message: "token is required." }, { status: 400 });
  }

  if (isSubmissionEditToken(token)) {
    try {
      const payload = verifySubmissionEditToken(token);
      const submission = await prisma.submitFormSubmission.findUnique({
        where: { id: payload.submission_id },
        select: {
          contactEmail: true,
          orderContextJson: true,
        },
      });

      if (!submission) {
        return NextResponse.json({ code: "token_not_found", message: "Token not found." }, { status: 404 });
      }
      if (submission.contactEmail.trim().toLowerCase() !== payload.email.trim().toLowerCase()) {
        return NextResponse.json({ code: "invalid_token", message: "Invalid or expired token." }, { status: 403 });
      }
      if (!submission.orderContextJson || typeof submission.orderContextJson !== "object" || Array.isArray(submission.orderContextJson)) {
        return NextResponse.json({ code: "order_context_unavailable", message: "Order context unavailable." }, { status: 404 });
      }

      const responsePayload = submission.orderContextJson as Record<string, unknown>;
      if (diag) {
        return NextResponse.json({
          ...responsePayload,
          debug: {
            ...(typeof responsePayload.debug === "object" && responsePayload.debug ? (responsePayload.debug as Record<string, unknown>) : {}),
            token_mode: "submission_edit",
            source: "submit-app-db",
          },
        });
      }
      return NextResponse.json(responsePayload);
    } catch (error) {
      const code = error instanceof Error ? error.message : "invalid_token";
      return NextResponse.json({ code, message: "Invalid or expired token." }, { status: 403 });
    }
  }

  const endpoint = `${WP_BASE_URL}/wp-json/bgg/v1/order-context?token=${encodeURIComponent(token)}${diag ? "&diag=1" : ""}`;

  try {
    const upstream = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    const text = await upstream.text();
    const payload = parseJson(text);
    if (payload && typeof payload === "object") {
      return NextResponse.json(payload, { status: upstream.status });
    }
    return NextResponse.json({ code: "upstream_non_json", message: "Order context upstream returned non-JSON body." }, { status: upstream.status });
  } catch (error) {
    return NextResponse.json(
      {
        code: "upstream_unavailable",
        message: "Unable to reach order context upstream.",
        error: error instanceof Error ? error.message : "network_error",
      },
      { status: 502 }
    );
  }
}
