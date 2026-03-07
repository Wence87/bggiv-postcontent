import { NextRequest, NextResponse } from "next/server";

import { getPostsAvailability } from "@/lib/bookingService";

const BUSINESS_TZ = "Europe/Brussels";
const POSTS_DAY_WINDOW = 365;

type PostsPublicProduct = "NEWS" | "PROMO_DEAL" | "GIVEAWAY" | "PROMO";

function badRequest(message: string) {
  return NextResponse.json({ code: "BAD_REQUEST", message }, { status: 400 });
}

function parseDateParam(value: string | null, field: string): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${field} date`);
  }

  return parsed;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function mapProduct(product: string | null): "news" | "promo" | "giveaway" | null {
  if (!product) return null;
  const normalized = product.toUpperCase() as PostsPublicProduct;
  if (normalized === "NEWS") return "news";
  if (normalized === "PROMO" || normalized === "PROMO_DEAL") return "promo";
  if (normalized === "GIVEAWAY") return "giveaway";
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const product = mapProduct(searchParams.get("product"));
  if (!product) {
    return badRequest("Invalid or missing product");
  }

  let from: Date;
  let to: Date;

  try {
    const now = new Date();
    const parsedFrom = parseDateParam(searchParams.get("from"), "from");
    const parsedTo = parseDateParam(searchParams.get("to"), "to");
    from = parsedFrom ?? now;
    to = parsedTo ?? addDays(from, POSTS_DAY_WINDOW - 1);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid date input";
    return badRequest(message);
  }

  if (to.getTime() < from.getTime()) {
    return badRequest("to must be greater than or equal to from");
  }

  const availability = await getPostsAvailability(product, from, to);

  return NextResponse.json({
    product,
    tz: BUSINESS_TZ,
    ...availability,
  });
}
