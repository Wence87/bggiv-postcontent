import { NextRequest, NextResponse } from "next/server";
import { fetchWPOrderContextByToken } from "@/lib/wpOrderContext";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim() || "";
  if (!token) {
    return NextResponse.json({ code: "missing_token", message: "token is required." }, { status: 400 });
  }

  try {
    const payload = await fetchWPOrderContextByToken(token);
    return NextResponse.json(payload);
  } catch (error) {
    const code = error instanceof Error ? error.message : "TOKEN_INVALID";
    if (code === "TOKEN_NOT_FOUND") {
      return NextResponse.json({ code: "token_not_found", message: "Token not found." }, { status: 404 });
    }
    if (code === "CONTEXT_INVALID") {
      return NextResponse.json({ code: "order_context_unavailable", message: "Order context unavailable." }, { status: 404 });
    }
    if (code === "TOKEN_EXPIRED" || code === "TOKEN_INVALID" || code === "TOKEN_INVALID_SIGNATURE" || code === "TOKEN_MALFORMED") {
      return NextResponse.json({ code: "invalid_token", message: "Invalid or expired token." }, { status: 403 });
    }
    if (code === "upstream_unavailable" || code === "network_error") {
      return NextResponse.json({ code: "upstream_unavailable", message: "Unable to reach order context upstream." }, { status: 502 });
    }
    return NextResponse.json(
      {
        code: "upstream_error",
        message: "Unable to load order context.",
        error: code,
      },
      { status: 502 }
    );
  }
}
