export type WPOrderContext = {
  order_number?: string;
  product: {
    product_type: string;
    product_key: string;
    form_id: string;
    form_fields?: Array<{ key: string; required?: boolean; type?: string }>;
  };
  order?: {
    number?: string;
    id?: number;
    order_id?: string;
  };
  prefill?: {
    company_name?: string;
    contact_email?: string;
  };
  reservation?: {
    ads_duration_weeks?: number | null;
    giveaway_duration_weeks?: number | null;
  };
};

const WP_BASE_URL = (process.env.NEXT_PUBLIC_WP_BASE_URL || "https://boardgamegiveaways.com").replace(/\/$/, "");

export async function fetchWPOrderContextByToken(token: string): Promise<WPOrderContext> {
  const endpoint = `${WP_BASE_URL}/wp-json/bgg/v1/order-context?token=${encodeURIComponent(token)}`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error("TOKEN_INVALID");
  }
  if (!payload || typeof payload !== "object" || !("product" in payload)) {
    throw new Error("CONTEXT_INVALID");
  }

  return payload as WPOrderContext;
}

function normalizeWooOrderId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return String(Math.trunc(value));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed) && trimmed !== "0") {
      return String(Number.parseInt(trimmed, 10));
    }
  }
  return null;
}

export function resolveLinkedOrderIdFromContext(context: WPOrderContext): string | null {
  return normalizeWooOrderId(context.order?.id) ?? normalizeWooOrderId(context.order?.order_id);
}
