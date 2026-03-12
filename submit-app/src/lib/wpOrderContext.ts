import { prisma } from "@/lib/prisma";
import { isSubmissionEditToken, verifySubmissionEditToken } from "@/lib/submissionEditToken";

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
  existing_submission?: {
    submission_id: string;
    linked_order_id: string | null;
    order_number: string | null;
    reservation_month_key: string | null;
    reservation_week_key: string | null;
    reservation_starts_at: string | null;
    form_data: Record<string, unknown>;
    assets: {
      banner_image_name: string;
      additional_image_1_name: string | null;
      additional_image_2_name: string | null;
      additional_image_3_name: string | null;
    };
  };
};

const WP_BASE_URL = (process.env.NEXT_PUBLIC_WP_BASE_URL || "https://boardgamegiveaways.com").replace(/\/$/, "");

export async function fetchWPOrderContextByToken(token: string): Promise<WPOrderContext> {
  if (isSubmissionEditToken(token)) {
    const payload = verifySubmissionEditToken(token);
    const submission = await prisma.submitFormSubmission.findUnique({
      where: { id: payload.submission_id },
      select: {
        id: true,
        linkedOrderId: true,
        orderNumber: true,
        contactEmail: true,
        reservationMonthKey: true,
        reservationWeekKey: true,
        reservationStartsAt: true,
        bannerImageName: true,
        additionalImage1Name: true,
        additionalImage2Name: true,
        additionalImage3Name: true,
        orderContextJson: true,
        formDataJson: true,
      },
    });
    if (!submission) {
      throw new Error("TOKEN_NOT_FOUND");
    }
    if (submission.contactEmail.trim().toLowerCase() !== payload.email.trim().toLowerCase()) {
      throw new Error("TOKEN_INVALID");
    }
    if (!submission.orderContextJson || typeof submission.orderContextJson !== "object" || Array.isArray(submission.orderContextJson)) {
      throw new Error("CONTEXT_INVALID");
    }

    const context = submission.orderContextJson as Record<string, unknown>;
    const contextOrder = context.order && typeof context.order === "object" && !Array.isArray(context.order)
      ? (context.order as Record<string, unknown>)
      : {};
    const contextPrefill = context.prefill && typeof context.prefill === "object" && !Array.isArray(context.prefill)
      ? (context.prefill as Record<string, unknown>)
      : {};
    const formData =
      submission.formDataJson && typeof submission.formDataJson === "object" && !Array.isArray(submission.formDataJson)
        ? (submission.formDataJson as Record<string, unknown>)
        : {};

    return {
      ...(context as WPOrderContext),
      order: {
        ...(contextOrder as WPOrderContext["order"]),
        id: normalizeWooOrderId(contextOrder.id) ? Number(normalizeWooOrderId(contextOrder.id)) : undefined,
        order_id: submission.linkedOrderId ?? normalizeWooOrderId(contextOrder.order_id) ?? undefined,
        number:
          typeof contextOrder.number === "string" && contextOrder.number.trim().length > 0
            ? contextOrder.number
            : submission.orderNumber ?? undefined,
      },
      prefill: {
        ...(contextPrefill as WPOrderContext["prefill"]),
        company_name:
          typeof contextPrefill.company_name === "string" && contextPrefill.company_name.trim().length > 0
            ? contextPrefill.company_name
            : (typeof formData.company_name === "string" ? formData.company_name : undefined),
        contact_email: submission.contactEmail,
      },
      existing_submission: {
        submission_id: submission.id,
        linked_order_id: submission.linkedOrderId,
        order_number: submission.orderNumber,
        reservation_month_key: submission.reservationMonthKey,
        reservation_week_key: submission.reservationWeekKey,
        reservation_starts_at: submission.reservationStartsAt?.toISOString() ?? null,
        form_data: formData,
        assets: {
          banner_image_name: submission.bannerImageName,
          additional_image_1_name: submission.additionalImage1Name,
          additional_image_2_name: submission.additionalImage2Name,
          additional_image_3_name: submission.additionalImage3Name,
        },
      },
    };
  }

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
