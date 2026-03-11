import { NextRequest, NextResponse } from "next/server";

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
