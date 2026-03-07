type WPOrderContext = {
  product: {
    product_type: string;
    product_key: string;
    form_id: string;
    form_fields?: Array<{ key: string; required?: boolean; type?: string }>;
  };
  prefill?: {
    company_name?: string;
    contact_email?: string;
  };
  reservation?: {
    ads_duration_weeks?: number | null;
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
