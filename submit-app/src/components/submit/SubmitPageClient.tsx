"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdsCalendar, type AdsWeek } from "@/components/public/AdsCalendar";
import { SponsorshipCalendar, type SponsorshipMonth } from "@/components/public/SponsorshipCalendar";
import { PostsCalendar, type PublicPostProduct } from "@/components/public/PostsCalendar";
import { resolveTimeZoneDateTimeToUtc } from "@/lib/timezone";
import { COUNTRY_GROUPS } from "@/lib/country-groups";

type ProductFormField = {
  key: string;
  label: string;
  type: "text" | "email" | "url" | "file" | "select" | "date" | "textarea" | "number";
  required?: boolean;
  readonly?: boolean;
  accept?: string;
  options?: string[];
  min?: number;
  max?: number;
  helperText?: string;
};

const DEFAULT_POSTS_FORM_FIELDS: ProductFormField[] = [
  { key: "company_name", label: "Company name", type: "text", required: true, readonly: true },
  { key: "contact_email", label: "Contact email", type: "email", required: true, readonly: true },
  { key: "cover_image_upload", label: "Cover image", type: "file", required: true, accept: ".webp,.jpg,.jpeg,image/webp,image/jpeg" },
  { key: "title", label: "Title", type: "text", required: true, max: 150 },
  { key: "body", label: "Body", type: "textarea", required: true },
  { key: "short_product_description", label: "Short product description", type: "textarea", required: true },
  { key: "embedded_video_link", label: "Embedded video link", type: "url", required: false },
  { key: "additional_image_1", label: "Additional image 1", type: "file", required: false, accept: ".webp,.jpg,.jpeg,image/webp,image/jpeg" },
  { key: "additional_image_2", label: "Additional image 2", type: "file", required: false, accept: ".webp,.jpg,.jpeg,image/webp,image/jpeg" },
  { key: "additional_image_3", label: "Additional image 3", type: "file", required: false, accept: ".webp,.jpg,.jpeg,image/webp,image/jpeg" },
  { key: "prize_name", label: "Prize name", type: "text", required: true, max: 150 },
  { key: "prize_short_description", label: "Prize short description", type: "textarea", required: true },
  {
    key: "giveaway_category",
    label: "Giveaway category",
    type: "select",
    required: true,
    options: [
      "Board Games",
      "Collectible Card Games",
      "Miniatures Games",
      "Role Playing Games",
      "Wargames",
      "Accessories",
      "Jigsaw Puzzles",
      "Puzzles",
      "Lifestyle Products",
      "Books",
      "Events",
    ],
  },
  { key: "prize_unit_value_usd", label: "Prize value (USD)", type: "number", required: true, min: 10, max: 700 },
  { key: "prize_units_count", label: "Number of units offered", type: "number", required: true, min: 2, max: 20 },
  { key: "minimum_age", label: "Minimum age", type: "number", required: true, min: 14 },
  { key: "giveaway_question", label: "Giveaway question", type: "text", required: true, max: 150 },
  { key: "answer_correct", label: "✅ Correct answer", type: "text", required: true, max: 150 },
  { key: "answer_wrong_1", label: "❌ Wrong answer 1", type: "text", required: true, max: 150 },
  { key: "answer_wrong_2", label: "❌ Wrong answer 2", type: "text", required: true, max: 150 },
  { key: "answer_wrong_3", label: "❌ Wrong answer 3", type: "text", required: true, max: 150 },
  { key: "answer_wrong_4", label: "❌ Wrong answer 4", type: "text", required: true, max: 150 },
  { key: "start_date", label: "Start date", type: "date", required: true, readonly: true },
  { key: "end_date", label: "End date", type: "date", required: true, readonly: true },
  { key: "notes", label: "Notes", type: "textarea", required: false },
];

const SHORT_PRODUCT_DESCRIPTION_HELPER =
  "Short text describing the product’s key features.";

const BODY_HELPER_TEXT =
  "This is the main content of the post. Use it to describe the product, explain the giveaway, and provide any relevant information players should know.";

const COVER_IMAGE_HELPER =
  "Maximum image size: 1200 × 675 px. Allowed file extensions: webp, jpg, jpeg. Max file size: 500 KB.";

const ADDITIONAL_IMAGES_HELPER =
  "To help us place the images correctly in your post, insert the image file names between the relevant paragraphs of your text.";

const GIVEAWAY_DATES_HELPER =
  "All dates and times are in Brussels time (Europe/Brussels, UTC+1 / UTC+2 DST). Please note that the duration of the giveaway is determined by the option selected in the previous step. Once your giveaway is approved, it will be displayed in three stages: announced with its upcoming start date, shown as active, and finally presented with the results once it has ended.";

const GIVEAWAY_PRIZE_NAME_HELPER =
  "A giveaway can feature only one type of prize, even if multiple units are offered. If you want to award different kinds of prizes, you must create separate giveaways—one for each prize type.";

const GIVEAWAY_UNITS_HELPER =
  "Each unit corresponds to one winner. Each winner receives exactly one unit. From 5 games, you get 🎁 1 free highlight option at its maximum level. From 10 games, you get 🎁🎁 2 free highlight options at their maximum level. With 20 games, you get 🎁🎁🎁 3 free highlight options at their maximum level.";

const GIVEAWAY_QA_HELPER =
  "Ask a closed-ended question with one single correct answer. Ensure the difficulty is well balanced: the question should encourage players to browse the rules or the campaign (for example) without being frustrating or trivial. The correct answer must be unambiguous, and the wrong answers must be clearly and unquestionably false.";

const CONTINENT_LABELS: Array<{
  key: keyof typeof COUNTRY_GROUPS.continents;
  label: string;
  sectionKey: string;
}> = [
  { key: "northAmerica", label: "North America", sectionKey: "north_america" },
  { key: "southAmerica", label: "South America", sectionKey: "south_america" },
  { key: "asia", label: "Asia", sectionKey: "asia" },
  { key: "africa", label: "Africa", sectionKey: "africa" },
  { key: "oceania", label: "Oceania", sectionKey: "oceania" },
  { key: "antarctica", label: "Antarctica", sectionKey: "antarctica" },
];

type OrderContextResponse = {
  order_number?: string;
  product: {
    product_type: "sponsorship" | "ads" | "news" | "promo" | "giveaway";
    form_id: string;
    product_key: string;
    base_fields: string[];
    form_fields?: ProductFormField[];
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
    giveaway_duration_weeks?: number | string | null;
  };
  options: Array<{
    option_key: string;
    canonical_key?: string;
    display_label?: string;
    business_type: string;
    enabled: boolean;
    selected_value?: string | null;
    selected_value_en?: string | null;
  }>;
  enabled_options: string[];
  derived_values: Record<string, unknown>;
  activated_blocks: Array<{
    name: string;
    fields: string;
    validation: string;
  }>;
  config_version: number | null;
};

type ReservationChoice = {
  monthKey?: string;
  weekKey?: string;
  weekKeys?: string[];
  startsAtUtc?: string;
};

type GiveawayFreeHighlightOption = {
  key:
    | "audience_amplifier"
    | "duration"
    | "hero_grid"
    | "sticky_post"
    | "sidebar_spotlight"
    | "extended_text_limit"
    | "additional_images"
    | "embedded_video"
    | "weekly_newsletter_feature";
  label: string;
  level: string;
};

type DiagnosticState = {
  endpoint: string;
  status: number;
  responseBody: unknown;
} | null;

type SubmitPageClientProps = {
  token: string;
  diag?: boolean;
};

const WP_BASE_URL = (process.env.NEXT_PUBLIC_WP_BASE_URL || "https://boardgamegiveaways.com").replace(/\/$/, "");
const FRONTEND_TREE_MARKER = "root-src";
const FRONTEND_BUILD_MARKER = process.env.NEXT_PUBLIC_BUILD_STAMP || "build-stamp-missing";
const GIVEAWAY_FREE_HIGHLIGHT_OPTIONS: GiveawayFreeHighlightOption[] = [
  { key: "audience_amplifier", label: "Audience Amplifier", level: "Multi-Action Entry" },
  { key: "duration", label: "Duration", level: "4 Weeks" },
  { key: "hero_grid", label: "Featured Spot in the Hero Grid", level: "7 Days" },
  { key: "sticky_post", label: "Sticky Post", level: "7 Days" },
  { key: "sidebar_spotlight", label: "Sidebar Spotlight", level: "7 Days" },
  { key: "extended_text_limit", label: "Extended Text Limit", level: "No character limit" },
  { key: "additional_images", label: "Additional Images", level: "Up to 3 additional images" },
  { key: "embedded_video", label: "Embedded Video", level: "Enabled" },
  { key: "weekly_newsletter_feature", label: "Weekly Newsletter Feature", level: "Enabled" },
];

function weekKeyToDate(weekKey: string): string {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!match) return "";
  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + (week - 1) * 7);
  return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, "0")}-${String(monday.getUTCDate()).padStart(2, "0")}`;
}

function monthKeyToRange(monthKey: string): { startDate: string; endDate: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month, 0));
  return {
    startDate: `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}-${String(first.getUTCDate()).padStart(2, "0")}`,
    endDate: `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, "0")}-${String(last.getUTCDate()).padStart(2, "0")}`,
  };
}

function productToPostsView(productType: OrderContextResponse["product"]["product_type"]): PublicPostProduct {
  if (productType === "promo") return "PROMO_DEAL";
  if (productType === "giveaway") return "GIVEAWAY";
  return "NEWS";
}

function normalizeOptionKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hasOption(enabledOptions: string[], optionKey: string): boolean {
  const target = normalizeOptionKey(optionKey);
  return enabledOptions.some((value) => {
    const normalized = normalizeOptionKey(value);
    return normalized === target || normalized.includes(target);
  });
}

function toTitleFromKey(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function extractWeeksLabel(value: string): string | null {
  const normalized = value.toLowerCase().trim();
  const weekMatch = /([1-4])\s*week/.exec(normalized);
  if (weekMatch) {
    const weeks = Number(weekMatch[1]);
    return `${weeks} Week${weeks > 1 ? "s" : ""}`;
  }
  const dayMatch = /(7|14|21|28)\s*day/.exec(normalized);
  if (dayMatch) {
    const weeks = Number(dayMatch[1]) / 7;
    return `${weeks} Week${weeks > 1 ? "s" : ""}`;
  }
  return null;
}

function extractDaysLabel(value: string): string | null {
  const normalized = value.toLowerCase().trim();
  const dayMatch = /(1|2|3|4|5|6|7|14|21|28)\s*day/.exec(normalized);
  if (dayMatch) {
    const days = Number(dayMatch[1]);
    return `${days} Day${days > 1 ? "s" : ""}`;
  }
  const weekMatch = /([1-4])\s*week/.exec(normalized);
  if (weekMatch) {
    const days = Number(weekMatch[1]) * 7;
    return `${days} Days`;
  }
  return null;
}

function stripTrailingPriceFragment(value: string): string {
  const decodedDollar = value.replace(/&#0*36;|&dollar;/gi, "$").replace(/&nbsp;/gi, " ");
  return decodedDollar.replace(/\s*\(\s*\+?\s*\$?\s*[\d\s.,]+(?:\s*[A-Za-z]{3})?\s*\)\s*$/u, "").trim();
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&amp;|&#0*38;/gi, "&")
    .replace(/&quot;|&#0*34;/gi, "\"")
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;|&#0*60;/gi, "<")
    .replace(/&gt;|&#0*62;/gi, ">")
    .replace(/&nbsp;|&#0*160;/gi, " ");
}

function normalizeSocialBoostValue(value: string): string {
  const decoded = decodeBasicHtmlEntities(value).replace(/\s+/g, " ").trim();
  return decoded.replace(/\bX\s*&\s*TikTok\b/gi, "X, TikTok");
}

function resolvePostBodyMaxLength(derivedValues: Record<string, unknown>, enabledOptions: string[]): number | null {
  const direct = derivedValues.post_body_max_length;
  if (typeof direct === "number" && Number.isFinite(direct) && direct > 0) return Math.trunc(direct);
  if (direct === null) return null;
  return hasOption(enabledOptions, "extended_textlimit") ? null : 1000;
}

function resolveGiveawayDurationDays(derivedValues: Record<string, unknown>): number {
  const directDays = derivedValues.giveaway_duration_days;
  if (typeof directDays === "number" && [7, 14, 21, 28].includes(directDays)) return directDays;
  if (typeof directDays === "string") {
    const parsedDays = Number.parseInt(directDays, 10);
    if ([7, 14, 21, 28].includes(parsedDays)) return parsedDays;
  }
  const directWeeks = derivedValues.giveaway_duration_weeks;
  if (typeof directWeeks === "number" && directWeeks >= 1 && directWeeks <= 4) return directWeeks * 7;
  if (typeof directWeeks === "string") {
    const parsedWeeks = Number.parseInt(directWeeks, 10);
    if (parsedWeeks >= 1 && parsedWeeks <= 4) return parsedWeeks * 7;
  }

  for (const [key, value] of Object.entries(derivedValues)) {
    if (!key.toLowerCase().includes("duration")) continue;
    if (typeof value === "number" && value >= 1 && value <= 4) return value * 7;
    if (typeof value === "number" && [7, 14, 21, 28].includes(value)) return value;
    if (typeof value === "string") {
      const cleaned = value.toLowerCase();
      const dayMatch = /(\d{1,2})\s*day/.exec(cleaned);
      if (dayMatch) {
        const days = Number(dayMatch[1]);
        if ([7, 14, 21, 28].includes(days)) return days;
      }
      const weekMatch = /(\d)\s*week/.exec(cleaned);
      if (weekMatch) {
        const weeks = Number(weekMatch[1]);
        if (weeks >= 1 && weeks <= 4) return weeks * 7;
      }
    }
    if (value && typeof value === "object") {
      const finalValue = (value as Record<string, unknown>).duration_weeks_final;
      if (typeof finalValue === "number" && finalValue >= 1 && finalValue <= 4) return finalValue * 7;
      const finalDays = (value as Record<string, unknown>).duration_days_final;
      if (typeof finalDays === "number" && [7, 14, 21, 28].includes(finalDays)) return finalDays;
      const genericFinal = (value as Record<string, unknown>).final;
      if (typeof genericFinal === "number" && [7, 14, 21, 28].includes(genericFinal)) return genericFinal;
    }
  }

  return 7;
}

function computeUnlockedHighlights(units: number): number {
  if (units >= 20) return 3;
  if (units >= 10) return 2;
  if (units >= 5) return 1;
  return 0;
}

function resolveGiveawayDurationDaysFromContext(
  derivedValues: Record<string, unknown>,
  reservation: OrderContextResponse["reservation"] | undefined,
  enabledOptions: string[]
): number {
  const reservationWeeksRaw = reservation?.giveaway_duration_weeks;
  const reservationWeeks =
    typeof reservationWeeksRaw === "number"
      ? reservationWeeksRaw
      : typeof reservationWeeksRaw === "string"
        ? Number.parseInt(reservationWeeksRaw, 10)
        : NaN;

  const fromDerived = resolveGiveawayDurationDays(derivedValues);
  const fromReservation =
    Number.isFinite(reservationWeeks) && reservationWeeks >= 1 && reservationWeeks <= 4 ? reservationWeeks * 7 : 7;
  const bestKnown = Math.max(fromDerived, fromReservation);
  if ([7, 14, 21, 28].includes(bestKnown)) return bestKnown;

  for (const option of enabledOptions) {
    const normalized = normalizeOptionKey(option);
    if (!normalized.includes("duration")) continue;
    const weekMatch = /([1-4])week/.exec(normalized);
    if (weekMatch) return Number(weekMatch[1]) * 7;
    const dayMatch = /(7|14|21|28)day/.exec(normalized);
    if (dayMatch) return Number(dayMatch[1]);
  }

  return 7;
}

export function SubmitPageClient({ token, diag = false }: SubmitPageClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<OrderContextResponse | null>(null);
  const [diagnostic, setDiagnostic] = useState<DiagnosticState>(null);

  const [values, setValues] = useState<Record<string, string>>({});
  const [fileValues, setFileValues] = useState<Record<string, File | null>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reservationError, setReservationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReserving, setIsReserving] = useState(false);
  const [reservationConfirmed, setReservationConfirmed] = useState(false);
  const [reservationChoice, setReservationChoice] = useState<ReservationChoice>({});

  const [selectedAdsWeek, setSelectedAdsWeek] = useState<AdsWeek | null>(null);
  const [reservedAdsWeekKeys, setReservedAdsWeekKeys] = useState<string[]>([]);
  const [selectedSponsorshipMonth, setSelectedSponsorshipMonth] = useState<SponsorshipMonth | null>(null);
  const [selectedPostDayKey, setSelectedPostDayKey] = useState<string | null>(null);
  const [selectedPostHour, setSelectedPostHour] = useState<number | null>(null);
  const [selectedShippingCountries, setSelectedShippingCountries] = useState<string[]>([]);
  const [selectedHighlightOptions, setSelectedHighlightOptions] = useState<string[]>([]);
  const [expandedGeoSections, setExpandedGeoSections] = useState<Record<string, boolean>>({
    europe: false,
    europe_eu: false,
    europe_other: false,
    north_america: false,
    south_america: false,
    asia: false,
    africa: false,
    oceania: false,
    antarctica: false,
  });

  const contextEndpoint = useMemo(
    () => `${WP_BASE_URL}/wp-json/bgg/v1/order-context?token=${encodeURIComponent(token)}${diag ? "&diag=1" : ""}`,
    [token, diag]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadContext() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(contextEndpoint, {
          method: "GET",
          headers: { Accept: "application/json" },
        });

        const responseText = await response.text();
        let parsed: unknown = null;
        try {
          parsed = responseText ? JSON.parse(responseText) : null;
        } catch {
          parsed = { raw: responseText.slice(0, 1000) };
        }

        if (!response.ok) {
          if (!cancelled) {
            setDiagnostic({ endpoint: contextEndpoint, status: response.status, responseBody: parsed });
            setError("Invalid or expired token");
          }
          return;
        }

        if (!parsed || typeof parsed !== "object" || !("product" in parsed)) {
          if (!cancelled) {
            setDiagnostic({ endpoint: contextEndpoint, status: response.status, responseBody: parsed });
            setError("Invalid order context payload");
          }
          return;
        }

        if (!cancelled) {
          setContext(parsed as OrderContextResponse);
          const parsedContext = parsed as OrderContextResponse;
          setValues({
            company_name: parsedContext.prefill?.company_name ?? "",
            contact_email: parsedContext.prefill?.contact_email ?? "",
          });
          setFileValues({});
          setValidationError(null);
          setSubmitError(null);
          setReservationError(null);
          setReservationConfirmed(false);
          setReservationChoice({});
          setSelectedAdsWeek(null);
          setReservedAdsWeekKeys([]);
          setSelectedSponsorshipMonth(null);
          setSelectedPostDayKey(null);
          setSelectedPostHour(null);
          setDiagnostic({ endpoint: contextEndpoint, status: response.status, responseBody: diag ? parsed : { ok: true } });
        }
      } catch (fetchError) {
        if (!cancelled) {
          setDiagnostic({
            endpoint: contextEndpoint,
            status: 0,
            responseBody: { error: fetchError instanceof Error ? fetchError.message : "Network error" },
          });
          setError("Unable to load order context");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadContext();
    return () => {
      cancelled = true;
    };
  }, [contextEndpoint, diag]);

  useEffect(() => {
    if (!context) return;
    setFieldValue("company_name", context.prefill?.company_name ?? "");
    setFieldValue("contact_email", context.prefill?.contact_email ?? "");
  }, [context]);

  useEffect(() => {
    if (!context) return;
    if (context.product.product_type === "ads") {
      const sourceWeekKey = reservationChoice.weekKey ?? selectedAdsWeek?.weekKey ?? "";
      setFieldValue("start_date", sourceWeekKey ? weekKeyToDate(sourceWeekKey) : "");
      setFieldValue("end_date", "");
    }
    if (context.product.product_type === "sponsorship") {
      const sourceMonthKey = reservationChoice.monthKey ?? selectedSponsorshipMonth?.monthKey ?? "";
      const range = sourceMonthKey ? monthKeyToRange(sourceMonthKey) : null;
      setFieldValue("start_date", range?.startDate ?? "");
      setFieldValue("end_date", range?.endDate ?? "");
    }
    if (context.product.product_type === "giveaway") {
      const startsAtIso = reservationChoice.startsAtUtc;
      if (!startsAtIso) {
        setFieldValue("start_date", "");
        setFieldValue("end_date", "");
        return;
      }
      const startsAt = new Date(startsAtIso);
      if (Number.isNaN(startsAt.getTime())) {
        setFieldValue("start_date", "");
        setFieldValue("end_date", "");
        return;
      }
      const startDate = new Date(startsAt);
      const endDate = new Date(startsAt);
      const durationDays = resolveGiveawayDurationDaysFromContext(
        context.derived_values ?? {},
        context.reservation,
        context.enabled_options ?? []
      );
      endDate.setUTCDate(endDate.getUTCDate() + Math.max(1, durationDays));
      const dateToKey = (date: Date) =>
        `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
      setFieldValue("start_date", dateToKey(startDate));
      setFieldValue("end_date", dateToKey(endDate));
    }
  }, [context, reservationChoice.weekKey, reservationChoice.monthKey, reservationChoice.startsAtUtc, selectedAdsWeek?.weekKey, selectedSponsorshipMonth?.monthKey]);

  useEffect(() => {
    setFieldValue("shipping_countries", JSON.stringify(selectedShippingCountries));
  }, [selectedShippingCountries]);

  useEffect(() => {
    setFieldValue("selected_highlight_options", JSON.stringify(selectedHighlightOptions));
  }, [selectedHighlightOptions]);

  useEffect(() => {
    const isGiveaway = context?.product.product_type === "giveaway";
    if (!isGiveaway) {
      setSelectedHighlightOptions([]);
      return;
    }
    const unlockedHighlightCount = computeUnlockedHighlights(Number(values.prize_units_count || 0));
    const giveawayHighlightKeys = new Set<string>(GIVEAWAY_FREE_HIGHLIGHT_OPTIONS.map((entry) => entry.key));
    setSelectedHighlightOptions((prev) => {
      const filtered = prev.filter((key) => giveawayHighlightKeys.has(key));
      if (filtered.length <= unlockedHighlightCount) return filtered;
      return filtered.slice(0, unlockedHighlightCount);
    });
  }, [context?.product.product_type, values.prize_units_count]);

  if (loading) {
    return <div className="rounded-md border bg-white p-4 text-sm text-muted-foreground">Loading submission context...</div>;
  }

  if (error || !context) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error ?? "Invalid submission link"}</div>
        {diag && diagnostic ? <pre className="overflow-auto rounded-md border bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(diagnostic, null, 2)}</pre> : null}
      </div>
    );
  }

  const currentContext = context;
  const isPostsProduct =
    currentContext.product.product_type === "news" ||
    currentContext.product.product_type === "promo" ||
    currentContext.product.product_type === "giveaway";
  const isGiveaway = currentContext.product.product_type === "giveaway";
  const postBodyMaxLength = isPostsProduct
    ? resolvePostBodyMaxLength(currentContext.derived_values ?? {}, currentContext.enabled_options ?? [])
    : null;
  const hasEmbeddedVideo =
    isPostsProduct &&
    (hasOption(currentContext.enabled_options ?? [], "embedded_video") ||
      (currentContext.options ?? []).some(
        (entry) => Boolean(entry.enabled) && normalizeOptionKey(entry.option_key).includes("embeddedvideo")
      ));
  const hasAdditionalImages =
    isPostsProduct &&
    ((currentContext.enabled_options ?? []).some((value) => normalizeOptionKey(value).includes("additionalimages")) ||
      (currentContext.options ?? []).some(
        (entry) => Boolean(entry.enabled) && normalizeOptionKey(entry.option_key).includes("additionalimages")
      ) ||
      hasOption(currentContext.enabled_options ?? [], "additional_images"));
  const giveawayUnitsCount = Number(values.prize_units_count || 0);
  const hasUnlimitedBody = isPostsProduct && postBodyMaxLength == null;
  const unlockedHighlightCount = isGiveaway ? computeUnlockedHighlights(giveawayUnitsCount) : 0;
  const availableHighlightOptions = GIVEAWAY_FREE_HIGHLIGHT_OPTIONS;
  const giveawayHighlightKeys = new Set<string>(GIVEAWAY_FREE_HIGHLIGHT_OPTIONS.map((entry) => entry.key));
  const allCountries = COUNTRY_GROUPS.world;
  const formFields = isPostsProduct
    ? DEFAULT_POSTS_FORM_FIELDS
    : ((currentContext.product.form_fields && currentContext.product.form_fields.length > 0)
      ? currentContext.product.form_fields
      : []);
  const effectivePostsFields = isPostsProduct
    ? formFields.filter((field) => {
        if (field.key === "embedded_video_link") return hasEmbeddedVideo;
        if (field.key.startsWith("additional_image_")) return hasAdditionalImages;
        if (!isGiveaway) {
          if (
            field.key === "prize_name" ||
            field.key === "prize_short_description" ||
            field.key === "giveaway_category" ||
            field.key === "prize_unit_value_usd" ||
            field.key === "prize_units_count" ||
            field.key === "minimum_age" ||
            field.key === "giveaway_question" ||
            field.key === "answer_correct" ||
            field.key.startsWith("answer_wrong_") ||
            field.key === "start_date" ||
            field.key === "end_date"
          ) {
            return false;
          }
        }
        return true;
      })
    : formFields;
  const normalizedEnabledOptions = Array.from(
    new Set(
      (currentContext.enabled_options ?? [])
        .filter((value): value is string => typeof value === "string")
        .map((value) => normalizeOptionKey(value))
    )
  );
  const derivedGiveawayDurationDaysUsed = isGiveaway
    ? resolveGiveawayDurationDaysFromContext(
        currentContext.derived_values ?? {},
        currentContext.reservation,
        currentContext.enabled_options ?? []
      )
    : null;
  const resolvedOrderNumber =
    currentContext.order?.number ??
    currentContext.order_number ??
    currentContext.order?.order_id ??
    (typeof currentContext.order?.id === "number" ? String(currentContext.order.id) : null);
  const destinationRequiredMessage = "You must select at least one destination where the prize can be shipped.";
  const activeOptionSummaries = (() => {
    const options = Array.isArray(currentContext.options) ? currentContext.options : [];
    const enabledKeys = new Set(
      (currentContext.enabled_options ?? [])
        .filter((v): v is string => typeof v === "string")
        .map((v) => normalizeOptionKey(v))
    );
    const labelByCanonical: Record<string, string> = {
      audience_amplifier: "Audience Amplifier",
      duration: "Duration",
      social_boost: "Social Boost",
      hero_grid: "Featured Spot in the Hero Grid",
      sticky_post: "Sticky Post",
      sidebar_spotlight: "Sidebar Spotlight",
      extended_text_limit: "Extended Text Limit",
      additional_images: "Additional Images",
      embedded_video: "Embedded Video",
      weekly_newsletter_feature: "Weekly Newsletter Feature",
    };
    const summaryByCanonical = new Map<string, { key: string; label: string; value: string }>();

    const toCanonical = (rawKey: string): string => {
      const normalized = normalizeOptionKey(rawKey);
      const aliasToCanonical: Record<string, string> = {
        audienceamplifier: "audience_amplifier",
        giveawayduration: "duration",
        duration: "duration",
        socialboost: "social_boost",
        featuredspotherogrid: "hero_grid",
        herogrid: "hero_grid",
        featuredspotherogrid7days: "hero_grid",
        stickypost: "sticky_post",
        sidebarspotlight: "sidebar_spotlight",
        extendedtextlimit: "extended_text_limit",
        extendedtext_limit: "extended_text_limit",
        additionalimages: "additional_images",
        additional_images: "additional_images",
        embeddedvideo: "embedded_video",
        embedded_video: "embedded_video",
        weeklynewsletter: "weekly_newsletter_feature",
        weeklynewsletterfeature: "weekly_newsletter_feature",
        newsletterfeature: "weekly_newsletter_feature",
        newsletter_feature: "weekly_newsletter_feature",
      };
      if (aliasToCanonical[normalized]) return aliasToCanonical[normalized];
      if (normalized.includes("herogrid")) return "hero_grid";
      if (normalized.includes("newsletter")) return "weekly_newsletter_feature";
      if (normalized.includes("extendedtext")) return "extended_text_limit";
      if (normalized.includes("additionalimages")) return "additional_images";
      if (normalized.includes("embeddedvideo")) return "embedded_video";
      if (normalized.includes("socialboost")) return "social_boost";
      if (normalized.includes("stickypost")) return "sticky_post";
      if (normalized.includes("sidebarspotlight")) return "sidebar_spotlight";
      if (normalized.includes("duration")) return "duration";
      if (normalized.includes("audienceamplifier")) return "audience_amplifier";
      return normalized;
    };

    const resolveValue = (canonical: string, option: { selected_value?: string | null; selected_value_en?: string | null }): string => {
      const selectedEn = decodeBasicHtmlEntities((option.selected_value_en ?? "").trim());
      if (selectedEn) {
        return stripTrailingPriceFragment(selectedEn);
      }

      const rawSelected = stripTrailingPriceFragment(decodeBasicHtmlEntities((option.selected_value ?? "").trim()));
      const normalizedRaw = rawSelected.toLowerCase();

      if (canonical === "duration") {
        if (rawSelected) {
          const fromRaw = extractWeeksLabel(rawSelected);
          if (fromRaw) return fromRaw;
        }
        if (derivedGiveawayDurationDaysUsed) {
          const weeks = Math.max(1, Math.round(derivedGiveawayDurationDaysUsed / 7));
          return `${weeks} Week${weeks > 1 ? "s" : ""}`;
        }
        return "";
      }

      if (canonical === "extended_text_limit") {
        if (normalizedRaw.includes("no character limit") || normalizedRaw.includes("unlimited") || normalizedRaw.includes("illimité")) {
          return "No character limit";
        }
        return "No character limit";
      }

      if (canonical === "additional_images") {
        return "Up to 3 additional images";
      }

      if (canonical === "hero_grid" || canonical === "sticky_post" || canonical === "sidebar_spotlight") {
        if (rawSelected) {
          const fromRaw = extractDaysLabel(rawSelected);
          if (fromRaw) return fromRaw;
        }
        return "Enabled";
      }

      if (canonical === "audience_amplifier") {
        if (rawSelected && !/^\d+$/.test(rawSelected)) return toTitleFromKey(rawSelected);
        return "Enabled";
      }

      if (canonical === "social_boost") {
        if (rawSelected && !/^\d+$/.test(rawSelected)) return normalizeSocialBoostValue(rawSelected);
        return "Enabled";
      }

      if (canonical === "embedded_video" || canonical === "weekly_newsletter_feature") {
        return "Enabled";
      }

      if (rawSelected && !/^\d+$/.test(rawSelected)) {
        if (normalizedRaw.includes("de ") && normalizedRaw.includes("jour")) return "Enabled";
        if (normalizedRaw.includes("illimité")) return "No character limit";
        return rawSelected;
      }

      return "Enabled";
    };

    for (const option of options) {
      const optionNorm = normalizeOptionKey(option.option_key);
      if (!Boolean(option.enabled) && !enabledKeys.has(optionNorm)) continue;
      const canonical = option.canonical_key ? toCanonical(option.canonical_key) : toCanonical(option.option_key);
      if (!canonical || summaryByCanonical.has(canonical)) continue;
      if (!labelByCanonical[canonical]) continue;
      const value = resolveValue(canonical, option);
      if (!value) continue;
      summaryByCanonical.set(canonical, {
        key: canonical,
        label: option.display_label && option.display_label.trim() ? option.display_label.trim() : labelByCanonical[canonical],
        value,
      });
    }

    const displayOrder = [
      "audience_amplifier",
      "duration",
      "social_boost",
      "hero_grid",
      "sticky_post",
      "sidebar_spotlight",
      "extended_text_limit",
      "additional_images",
      "embedded_video",
      "weekly_newsletter_feature",
    ];

    return displayOrder
      .map((key) => summaryByCanonical.get(key))
      .filter((entry): entry is { key: string; label: string; value: string } => Boolean(entry));
  })();
  const getGroupSelectionState = (countries: string[]) => {
    if (!countries.length) return "none" as const;
    const selectedCount = countries.reduce((count, country) => count + (selectedShippingCountries.includes(country) ? 1 : 0), 0);
    if (selectedCount === 0) return "none" as const;
    if (selectedCount === countries.length) return "all" as const;
    return "partial" as const;
  };
  const groupStateLabel = (state: "all" | "partial" | "none") => {
    if (state === "all") return { icon: "✓", className: "text-emerald-700", text: "All selected" };
    if (state === "partial") return { icon: "•", className: "text-amber-700", text: "Partially selected" };
    return { icon: "✕", className: "text-red-700", text: "None selected" };
  };

  function setFieldValue(key: string, value: string) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  function setFieldFileValue(key: string, file: File | null) {
    setFileValues((previous) => ({ ...previous, [key]: file }));
  }

  function setBoundedNumberFieldValue(key: string, raw: string, min?: number, max?: number) {
    if (raw.trim() === "") {
      setFieldValue(key, "");
      return;
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return;
    let bounded = numeric;
    if (typeof min === "number" && bounded < min) bounded = min;
    if (typeof max === "number" && bounded > max) bounded = max;
    setFieldValue(key, String(Math.trunc(bounded)));
  }

  function buildReservationPayload(): ReservationChoice | null {
    if (currentContext.product.product_type === "ads") {
      if (!selectedAdsWeek || selectedAdsWeek.status !== "available") return null;
      return { weekKey: selectedAdsWeek.weekKey };
    }

    if (currentContext.product.product_type === "sponsorship") {
      if (!selectedSponsorshipMonth || selectedSponsorshipMonth.status !== "available") return null;
      return { monthKey: selectedSponsorshipMonth.monthKey };
    }

    if (!selectedPostDayKey || selectedPostHour == null) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(selectedPostDayKey);
    if (!match) return null;

    const startsAt = resolveTimeZoneDateTimeToUtc(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      selectedPostHour,
      0,
      "Europe/Brussels"
    );

    return { startsAtUtc: startsAt.toISOString() };
  }

  async function reserveSelection() {
    setReservationError(null);
    const payload = buildReservationPayload();
    if (!payload) {
      setReservationError("Please select an available slot before reserving.");
      return;
    }

    setIsReserving(true);
    try {
      const response = await fetch("/api/submit/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...payload }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof body?.code === "string" ? body.code : "Reservation failed";
        throw new Error(message);
      }

      const reservation = body?.reservation as
        | { monthKey?: string | null; weekKey?: string | null; startsAtUtc?: string | null }
        | undefined;
      const reservations = Array.isArray(body?.reservations) ? body.reservations : [];
      const reservedWeeks = reservations
        .map((entry: { weekKey?: string | null }) => (typeof entry.weekKey === "string" ? entry.weekKey : null))
        .filter((value: string | null): value is string => Boolean(value));

      setReservationChoice({
        monthKey: reservation?.monthKey ?? undefined,
        weekKey: reservation?.weekKey ?? undefined,
        weekKeys: reservedWeeks.length ? reservedWeeks : undefined,
        startsAtUtc: reservation?.startsAtUtc ?? undefined,
      });
      setReservedAdsWeekKeys(reservedWeeks);
      setReservationConfirmed(true);
      setValidationError(null);
    } catch (reserveError) {
      setReservationError(reserveError instanceof Error ? reserveError.message : "Reservation failed");
    } finally {
      setIsReserving(false);
    }
  }

  function validateField(field: ProductFormField): boolean {
    if (field.key === "start_date" && currentContext.product.product_type === "ads") {
      return Boolean(values.start_date);
    }

    if (!field.required) return true;
    if (field.type === "file") return Boolean(fileValues[field.key]);
    if (field.key === "body") return (values.body ?? "").trim().length > 0;
    const rawValue = values[field.key];
    return typeof rawValue === "string" && rawValue.trim().length > 0;
  }

  function validateForm(): boolean {
    if (!reservationConfirmed) {
      setValidationError("You must reserve an available slot before submitting the form.");
      return false;
    }

    const fieldsToValidate = isPostsProduct ? effectivePostsFields : formFields;
    for (const field of fieldsToValidate) {
      if (!validateField(field)) {
        setValidationError(`Missing required field: ${field.label}`);
        return false;
      }

      if (field.type === "email" && values[field.key]) {
        const email = values[field.key].trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          setValidationError(`Invalid email: ${field.label}`);
          return false;
        }
      }

      if (field.type === "url" && values[field.key]) {
        if (field.key === "embedded_video_link" && !values[field.key].trim()) {
          continue;
        }
        try {
          const parsedUrl = new URL(values[field.key]);
          if (!parsedUrl.protocol.startsWith("http")) throw new Error("Unsupported protocol");
        } catch {
          setValidationError(`Invalid URL: ${field.label}`);
          return false;
        }
      }

      if (field.type === "file" && field.key === "banner_image_upload") {
        const file = fileValues.banner_image_upload;
        if (!file) {
          setValidationError("Missing required field: Banner image");
          return false;
        }

        const lowerName = file.name.toLowerCase();
        const hasValidExtension = lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg");
        if (!hasValidExtension) {
          setValidationError("Invalid image format. Only JPG/JPEG files are allowed.");
          return false;
        }

        if (file.size > 200 * 1024) {
          setValidationError("Image too large. Maximum allowed size is 200 KB.");
          return false;
        }
      }

      if (field.type === "file" && field.key === "cover_image_upload") {
        const file = fileValues.cover_image_upload;
        if (!file) {
          setValidationError("Missing required field: Cover image");
          return false;
        }
        const lowerName = file.name.toLowerCase();
        if (!lowerName.endsWith(".jpg") && !lowerName.endsWith(".jpeg") && !lowerName.endsWith(".webp")) {
          setValidationError("Invalid image format. Only WEBP/JPG/JPEG files are allowed.");
          return false;
        }
        if (file.size > 500 * 1024) {
          setValidationError("Image too large. Maximum allowed size is 500 KB.");
          return false;
        }
      }

      if (field.type === "file" && field.key.startsWith("additional_image_")) {
        const file = fileValues[field.key];
        if (!file) continue;
        const lowerName = file.name.toLowerCase();
        if (!lowerName.endsWith(".jpg") && !lowerName.endsWith(".jpeg") && !lowerName.endsWith(".webp")) {
          setValidationError("Invalid image format. Only WEBP/JPG/JPEG files are allowed.");
          return false;
        }
        if (file.size > 500 * 1024) {
          setValidationError("Image too large. Maximum allowed size is 500 KB.");
          return false;
        }
      }

      if (field.key === "title" && values.title && values.title.trim().length > 150) {
        setValidationError("Title is too long. Maximum allowed length is 150 characters.");
        return false;
      }

      if (field.key === "prize_name" && values.prize_name && values.prize_name.trim().length > 150) {
        setValidationError("Prize name is too long. Maximum allowed length is 150 characters.");
        return false;
      }
      if (field.key === "prize_short_description" && values.prize_short_description) {
        const len = values.prize_short_description.trim().length;
        if (len > 300) {
          setValidationError("Prize short description is too long. Maximum allowed length is 300 characters.");
          return false;
        }
      }

      if (
        (field.key === "giveaway_question" ||
          field.key === "answer_correct" ||
          field.key === "answer_wrong_1" ||
          field.key === "answer_wrong_2" ||
          field.key === "answer_wrong_3" ||
          field.key === "answer_wrong_4") &&
        values[field.key] &&
        values[field.key].trim().length > 150
      ) {
        setValidationError(`${field.label} is too long. Maximum allowed length is 150 characters.`);
        return false;
      }

      if (field.key === "body" && values.body) {
        const bodyLength = (values.body ?? "").length;
        if (postBodyMaxLength != null && bodyLength > postBodyMaxLength) {
          setValidationError(`Body is too long. Maximum allowed length is ${postBodyMaxLength} characters.`);
          return false;
        }
      }

      if (field.key === "short_product_description" && values.short_product_description) {
        const len = values.short_product_description.trim().length;
        if (len < 100 || len > 300) {
          setValidationError("Short product description must be between 100 and 300 characters.");
          return false;
        }
      }

      if (field.type === "number" && values[field.key]) {
        const numeric = Number(values[field.key]);
        if (!Number.isFinite(numeric)) {
          setValidationError(`Invalid number: ${field.label}`);
          return false;
        }
        if (typeof field.min === "number" && numeric < field.min) {
          setValidationError(`${field.label} must be at least ${field.min}.`);
          return false;
        }
        if (typeof field.max === "number" && numeric > field.max) {
          setValidationError(`${field.label} must be at most ${field.max}.`);
          return false;
        }
      }
    }

    if (isGiveaway) {
      if (selectedShippingCountries.length < 1) {
        setValidationError(destinationRequiredMessage);
        return false;
      }
      if (selectedHighlightOptions.some((key) => !giveawayHighlightKeys.has(key))) {
        setValidationError("Invalid free highlight option selected.");
        return false;
      }
      if (selectedHighlightOptions.length > unlockedHighlightCount) {
        setValidationError(`You can select at most ${unlockedHighlightCount} free highlight option(s).`);
        return false;
      }
    }

    setValidationError(null);
    return true;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (!validateForm()) return;

    const payload = new FormData();
    payload.append("token", token);
    payload.append("product_key", currentContext.product.product_key);
    payload.append("form_data", JSON.stringify(values));
    payload.append("reservation_choice", JSON.stringify(reservationChoice));

    for (const [fieldKey, file] of Object.entries(fileValues)) {
      if (!file) continue;
      payload.append(fieldKey, file);
      payload.append("uploaded_files", file);
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/submit/finalize", {
        method: "POST",
        body: payload,
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof body?.message === "string" ? body.message : typeof body?.code === "string" ? body.code : "Submission failed";
        throw new Error(message);
      }

      router.push("/submit/success");
    } catch (submitRequestError) {
      setSubmitError(submitRequestError instanceof Error ? submitRequestError.message : "Submission failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderField(field: ProductFormField) {
    if (field.key === "order_number") {
      return (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={field.key}>Order number</Label>
          <Input id={field.key} name={field.key} type="text" value={resolvedOrderNumber ?? ""} readOnly disabled />
        </div>
      );
    }

    if (field.key === "start_date" && currentContext.product.product_type === "ads") {
      return (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={field.key}>{`${field.label} *`}</Label>
          <Input id={field.key} name={field.key} type="date" value={values[field.key] ?? ""} readOnly disabled />
          <p className="text-xs text-muted-foreground">Derived from reserved week. Manual date entry is disabled.</p>
        </div>
      );
    }

    if ((field.key === "start_date" || field.key === "end_date") && currentContext.product.product_type === "sponsorship") {
      return (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={field.key}>{`${field.label} *`}</Label>
          <Input id={field.key} name={field.key} type="date" value={values[field.key] ?? ""} readOnly disabled />
          <p className="text-xs text-muted-foreground">Derived from reserved month. Manual date entry is disabled.</p>
        </div>
      );
    }

    if ((field.key === "start_date" || field.key === "end_date") && currentContext.product.product_type === "giveaway") {
      return (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={field.key}>{`${field.label} *`}</Label>
          <Input id={field.key} name={field.key} type="date" value={values[field.key] ?? ""} readOnly disabled />
        </div>
      );
    }

    if (field.readonly) {
      const companyPrefilled = Boolean(currentContext.prefill?.company_name && currentContext.prefill.company_name.trim().length > 0);
      const contactPrefilled = Boolean(currentContext.prefill?.contact_email && currentContext.prefill.contact_email.trim().length > 0);

      if (field.key === "company_name" && !companyPrefilled) {
        // Editable fallback handled below.
      } else if (field.key === "contact_email" && !contactPrefilled) {
        // Editable fallback handled below.
      } else {
        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>{field.label}</Label>
            <Input id={field.key} name={field.key} type="text" value={values[field.key] ?? ""} readOnly disabled />
          </div>
        );
      }
    }

    if (field.key === "company_name" && !(currentContext.prefill?.company_name && currentContext.prefill.company_name.trim())) {
      return (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={field.key}>Company name *</Label>
          <Input
            id={field.key}
            name={field.key}
            type="text"
            required
            value={values[field.key] ?? ""}
            onChange={(event) => setFieldValue(field.key, event.target.value)}
          />
        </div>
      );
    }

    if (field.key === "contact_email" && !(currentContext.prefill?.contact_email && currentContext.prefill.contact_email.trim())) {
      return (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={field.key}>Contact email *</Label>
          <Input
            id={field.key}
            name={field.key}
            type="email"
            required
            value={values[field.key] ?? ""}
            onChange={(event) => setFieldValue(field.key, event.target.value)}
          />
        </div>
      );
    }

    const requiredMark = field.required ? " *" : "";
    const normalizedLabel = field.key === "notes" ? "Note to admin" : field.label;
    const label = `${normalizedLabel}${requiredMark}`;

    if (field.type === "textarea") {
      const showBodyCounter = field.key === "body";
      const showShortDescCounter = field.key === "short_product_description";
      const showPrizeShortCounter = field.key === "prize_short_description";
      const bodyLength = (values.body ?? "").length;
      const shortLength = values.short_product_description?.length ?? 0;
      const prizeShortLength = values.prize_short_description?.length ?? 0;
      return (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={field.key}>{label}</Label>
          {showBodyCounter ? (
            <p className="text-xs text-muted-foreground">{BODY_HELPER_TEXT}</p>
          ) : null}
          {showShortDescCounter ? (
            <p className="text-xs text-muted-foreground">{SHORT_PRODUCT_DESCRIPTION_HELPER}</p>
          ) : null}
          <textarea
            id={field.key}
            name={field.key}
            value={values[field.key] ?? ""}
            onChange={(event) => setFieldValue(field.key, event.target.value)}
            required={Boolean(field.required)}
            maxLength={showShortDescCounter || showPrizeShortCounter ? 300 : undefined}
            rows={showBodyCounter ? 10 : 4}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 break-words [overflow-wrap:anywhere]"
          />
          {showBodyCounter ? (
            <p className="text-xs text-muted-foreground">
              {postBodyMaxLength == null ? "No character limit" : `${bodyLength}/${postBodyMaxLength} characters`}
            </p>
          ) : null}
          {showShortDescCounter ? (
            <>
              <p className="text-xs text-muted-foreground">{shortLength}/300 characters</p>
            </>
          ) : null}
          {showPrizeShortCounter ? (
            <p className="text-xs text-muted-foreground">{prizeShortLength}/300 characters</p>
          ) : null}
          {field.key === "giveaway_question" ? (
            <p className="text-xs text-muted-foreground">{GIVEAWAY_QA_HELPER}</p>
          ) : null}
        </div>
      );
    }

    if (field.type === "select") {
      return (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={field.key}>{label}</Label>
          <select
            id={field.key}
            name={field.key}
            value={values[field.key] ?? ""}
            onChange={(event) => setFieldValue(field.key, event.target.value)}
            required={Boolean(field.required)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">Select...</option>
            {(field.options ?? []).map((optionValue) => (
              <option key={optionValue} value={optionValue}>
                {optionValue}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (field.type === "file") {
      return (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={field.key}>{label}</Label>
          <Input
            id={field.key}
            name={field.key}
            type="file"
            required={Boolean(field.required)}
            accept={field.accept}
            onChange={(event) => setFieldFileValue(field.key, event.target.files?.[0] ?? null)}
          />
          {field.key === "banner_image_upload" ? (
            <p className="text-xs text-muted-foreground">
              {currentContext.product.product_type === "sponsorship"
                ? "Upload your sponsorship banner, JPG/JPEG only. Maximum file size: 200 KB."
                : "Upload a Medium Rectangle banner (680 × 680 px), JPG/JPEG only. Maximum file size: 200 KB."}
            </p>
          ) : null}
          {field.key === "additional_image_3" ? (
            <p className="text-xs text-muted-foreground">{ADDITIONAL_IMAGES_HELPER}</p>
          ) : null}
        </div>
      );
    }

    if (field.type === "number") {
      return (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={field.key}>{label}</Label>
          {field.key === "prize_unit_value_usd" ? (
            <p className="text-xs text-muted-foreground">Per unit. Shipping not included.</p>
          ) : null}
          {field.key === "prize_units_count" ? (
            <p className="text-xs text-muted-foreground">
              Minimum: 2 units. Maximum: 20 units. {GIVEAWAY_UNITS_HELPER}
            </p>
          ) : null}
          {field.key === "minimum_age" ? (
            <p className="text-xs text-muted-foreground">Depending of the laws in your country.</p>
          ) : null}
          <Input
            id={field.key}
            name={field.key}
            type="number"
            min={field.min}
            max={field.max}
            step={1}
            required={Boolean(field.required)}
            value={values[field.key] ?? ""}
            onChange={(event) => setBoundedNumberFieldValue(field.key, event.target.value, field.min, field.max)}
          />
          {field.key === "prize_unit_value_usd" ? (
            <p className="text-xs text-muted-foreground">Minimum value: $10.</p>
          ) : null}
        </div>
      );
    }

    return (
      <div key={field.key} className="space-y-2">
        <Label htmlFor={field.key}>{label}</Label>
        {field.key === "prize_name" ? (
          <p className="text-xs text-muted-foreground">{GIVEAWAY_PRIZE_NAME_HELPER}</p>
        ) : null}
        <Input
          id={field.key}
          name={field.key}
          type={field.type}
          required={Boolean(field.required)}
          maxLength={
            field.key === "title" ||
            field.key === "prize_name" ||
            field.key === "giveaway_question" ||
            field.key === "answer_correct" ||
            field.key === "answer_wrong_1" ||
            field.key === "answer_wrong_2" ||
            field.key === "answer_wrong_3" ||
            field.key === "answer_wrong_4"
              ? 150
              : undefined
          }
          value={values[field.key] ?? ""}
          onChange={(event) => setFieldValue(field.key, event.target.value)}
        />
        {field.key === "title" ? (
          <p className="text-xs text-muted-foreground">{(values.title?.length ?? 0)}/150 characters</p>
        ) : null}
        {field.key === "prize_name" ? (
          <p className="text-xs text-muted-foreground">{(values.prize_name?.length ?? 0)}/150 characters</p>
        ) : null}
        {(field.key === "giveaway_question" ||
          field.key === "answer_correct" ||
          field.key === "answer_wrong_1" ||
          field.key === "answer_wrong_2" ||
          field.key === "answer_wrong_3" ||
          field.key === "answer_wrong_4") ? (
          <p className="text-xs text-muted-foreground">{(values[field.key]?.length ?? 0)}/150 characters</p>
        ) : null}
      </div>
    );
  }

  const productType = currentContext.product.product_type;
  const productBadgeLabel = productType === "promo" ? "Promo Deal" : productType.toUpperCase();
  const hasConfirmedReservation =
    reservationConfirmed &&
    Boolean(reservationChoice.weekKey || reservationChoice.monthKey || reservationChoice.startsAtUtc);
  const candidatePostStartsAtUtc =
    selectedPostDayKey && selectedPostHour != null
      ? (() => {
          const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(selectedPostDayKey);
          if (!match) return null;
          return resolveTimeZoneDateTimeToUtc(
            Number(match[1]),
            Number(match[2]),
            Number(match[3]),
            selectedPostHour,
            0,
            "Europe/Brussels"
          ).toISOString();
        })()
      : null;
  const hasCandidateChange =
    hasConfirmedReservation &&
    (
      (productType === "ads" &&
        Boolean(selectedAdsWeek?.weekKey) &&
        selectedAdsWeek?.weekKey !== reservationChoice.weekKey) ||
      (productType === "sponsorship" &&
        Boolean(selectedSponsorshipMonth?.monthKey) &&
        selectedSponsorshipMonth?.monthKey !== reservationChoice.monthKey) ||
      ((productType === "news" || productType === "promo" || productType === "giveaway") &&
        Boolean(candidatePostStartsAtUtc) &&
        candidatePostStartsAtUtc !== reservationChoice.startsAtUtc)
    );
  const reservationLegend = (
    <div className="rounded-md border bg-white p-3 text-xs">
      <p className="mb-2 font-medium">Legend</p>
      <div className="grid grid-cols-4 gap-2">
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-slate-300" /> Locked</div>
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-green-200" /> Available</div>
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-blue-300" /> My reservation</div>
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-red-200" /> Full</div>
      </div>
    </div>
  );
  const fieldsToRender = isPostsProduct ? effectivePostsFields : formFields;
  const safeFieldsToRender =
    isPostsProduct && fieldsToRender.length === 0 ? DEFAULT_POSTS_FORM_FIELDS : fieldsToRender;
  const fieldMap = new Map(safeFieldsToRender.map((field) => [field.key, field] as const));
  const renderFieldsByKeys = (keys: string[]) =>
    keys
      .map((key) => fieldMap.get(key))
      .filter((field): field is ProductFormField => Boolean(field))
      .map((field) => renderField(field));

  const toggleHighlightOption = (optionKey: string) => {
    setSelectedHighlightOptions((prev) => {
      if (prev.includes(optionKey)) return prev.filter((item) => item !== optionKey);
      if (prev.length >= unlockedHighlightCount) {
        setValidationError(`You can select at most ${unlockedHighlightCount} free highlight option(s).`);
        return prev;
      }
      setValidationError(null);
      return [...prev, optionKey];
    });
  };

  const toggleCountry = (country: string) => {
    setSelectedShippingCountries((prev) =>
      prev.includes(country) ? prev.filter((value) => value !== country) : [...prev, country]
    );
  };

  const selectAllWorld = () => setSelectedShippingCountries(allCountries);
  const deselectAllWorld = () => setSelectedShippingCountries([]);
  const toggleGeoSection = (section: string) => {
    setExpandedGeoSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };
  const addCountries = (countries: string[]) => {
    setSelectedShippingCountries((prev) => Array.from(new Set([...prev, ...countries])));
  };
  const removeCountries = (countries: string[]) => {
    const blocked = new Set(countries);
    setSelectedShippingCountries((prev) => prev.filter((country) => !blocked.has(country)));
  };
  const diagFrontend = {
    build_marker: FRONTEND_BUILD_MARKER,
    frontend_tree: FRONTEND_TREE_MARKER,
    product_key: currentContext.product.product_key,
    product_type: currentContext.product.product_type,
    order_number_seen: resolvedOrderNumber,
    enabled_options_raw: currentContext.enabled_options ?? [],
    enabled_options_normalized: normalizedEnabledOptions,
    additional_images_active: hasAdditionalImages,
    unlimited_body_active: hasUnlimitedBody,
    giveaway_duration_weeks_from_reservation: currentContext.reservation?.giveaway_duration_weeks ?? null,
    giveaway_duration_days_used: derivedGiveawayDurationDaysUsed,
    editor_mode: "textarea-plain",
    bullet_command_available: false,
    editor_is_contenteditable: false,
    body_state_contains_html: /<[^>]+>/.test(values.body ?? ""),
  };

  return (
    <div className="space-y-6">
      <section className="rounded-md border bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Submission Context</h2>
          <Badge variant="secondary">{productBadgeLabel}</Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Form: {currentContext.product.form_id}</p>
        <p className="text-sm text-muted-foreground">Product key: {currentContext.product.product_key}</p>
        {resolvedOrderNumber ? (
          <p className="text-sm text-muted-foreground">Order number: {resolvedOrderNumber}</p>
        ) : null}
        {activeOptionSummaries.length > 0 ? (
          <div className="mt-3 rounded-md border bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-700">Purchased options</p>
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {activeOptionSummaries.map((item) => (
                <p key={item.key} className="text-xs text-muted-foreground">
                  <span className="font-medium text-slate-700">{item.label}:</span> {item.value}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-md border bg-white p-4 space-y-4">
        <div>
          <h3 className="text-base font-semibold">Reservation</h3>
          <p className="text-sm text-muted-foreground">Select an available slot from the real booking engine, then reserve it.</p>
        </div>

        {productType === "ads" ? (
          <div className="space-y-3">
            <AdsCalendar
              selectedWeekKey={selectedAdsWeek?.weekKey ?? null}
              onSelectWeek={setSelectedAdsWeek}
              onlyAvailableSelection
              reservedWeekKeys={reservedAdsWeekKeys}
            />
            {reservationLegend}
            <div className="rounded-md border bg-white p-3 text-xs">
              {currentContext.reservation?.ads_duration_weeks ? (
                <p className="text-muted-foreground">
                  Purchased duration: {currentContext.reservation.ads_duration_weeks} week{currentContext.reservation.ads_duration_weeks > 1 ? "s" : ""}.
                  Selecting a start week reserves consecutive weeks automatically.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {productType === "sponsorship" ? (
          <div className="space-y-3">
            <SponsorshipCalendar
              selectedMonthKey={selectedSponsorshipMonth?.monthKey ?? null}
              onSelectMonth={setSelectedSponsorshipMonth}
              onlyAvailableSelection
              reservedMonthKeys={reservationChoice.monthKey ? [reservationChoice.monthKey] : []}
            />
            {reservationLegend}
          </div>
        ) : null}

        {(productType === "news" || productType === "promo" || productType === "giveaway") ? (
          <div className="space-y-3">
            <PostsCalendar
              product={productToPostsView(productType)}
              selectedDayKey={selectedPostDayKey}
              onSelectDayKey={setSelectedPostDayKey}
              selectedHour={selectedPostHour}
              onSelectHour={setSelectedPostHour}
              onlyAvailableSelection
              reservedStartsAtUtc={reservationChoice.startsAtUtc ?? null}
            />
            {reservationLegend}
          </div>
        ) : null}

        {reservationError ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{reservationError}</div> : null}
        {hasConfirmedReservation ? (
          <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">Reservation confirmed.</div>
        ) : (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            No reservation confirmed yet. Submission is blocked until you reserve a valid slot.
          </div>
        )}
        {hasCandidateChange ? (
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            You already have a confirmed reservation. Reserve again to change it.
          </div>
        ) : null}
        <Button type="button" onClick={() => void reserveSelection()} disabled={isReserving}>
          {isReserving ? "Reserving..." : hasConfirmedReservation ? "Change reservation" : "Reserve selected slot"}
        </Button>
      </section>

      <section className="rounded-md border bg-white p-4">
        <h3 className="text-base font-semibold">Submission form</h3>
        {safeFieldsToRender.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No dynamic fields configured for this product yet.</p>
        ) : (
          <form className="mt-4 space-y-4" onSubmit={handleSubmit} noValidate>
            {isPostsProduct ? (
              <div className="space-y-4">
                <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                  <h4 className="text-sm font-semibold">A. Basic product information</h4>
                  {resolvedOrderNumber ? renderField({ key: "order_number", label: "Order number", type: "text", readonly: true }) : null}
                  {renderFieldsByKeys(["company_name", "contact_email"])}
                </div>

                <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                  <h4 className="text-sm font-semibold">B. Visual assets</h4>
                  <p className="text-xs text-muted-foreground">{COVER_IMAGE_HELPER}</p>
                  {renderFieldsByKeys(["cover_image_upload"])}
                  {hasAdditionalImages ? renderFieldsByKeys(["additional_image_1", "additional_image_2", "additional_image_3"]) : null}
                </div>

                <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                  <h4 className="text-sm font-semibold">C. Main content</h4>
                  <p className="text-xs text-muted-foreground">Craft a clear editorial message for your audience. All submissions are reviewed by our editorial team before publication and must follow our contributor guidelines.</p>
                  {renderFieldsByKeys(isGiveaway && hasEmbeddedVideo ? ["title", "body", "short_product_description", "embedded_video_link"] : ["title", "body", "short_product_description"])}
                </div>

                {isGiveaway ? (
                  <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                    <h4 className="text-sm font-semibold">D. Giveaway details</h4>
                    <p className="text-xs text-muted-foreground">Define prize details and audience requirements.</p>
                    {renderFieldsByKeys(["prize_name", "prize_short_description", "giveaway_category", "prize_unit_value_usd", "prize_units_count"])}
                    {unlockedHighlightCount > 0 ? (
                      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                        <p className="text-sm font-semibold text-emerald-900">
                          {unlockedHighlightCount === 1 ? "🎁 You unlocked 1 free highlight option at its maximum level." : null}
                          {unlockedHighlightCount === 2 ? "🎁🎁 You unlocked 2 free highlight options at their maximum level." : null}
                          {unlockedHighlightCount >= 3 ? "🎁🎁🎁 You unlocked 3 free highlight options at their maximum level." : null}
                        </p>
                        <p className="text-xs text-emerald-900">
                          {unlockedHighlightCount === 1 ? "Select the highlight option you want to activate for free." : null}
                          {unlockedHighlightCount === 2 ? "Select up to 2 highlight options to activate for free." : null}
                          {unlockedHighlightCount >= 3 ? "Select up to 3 highlight options to activate for free." : null}
                        </p>
                        {availableHighlightOptions.length > 0 ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {availableHighlightOptions.map((option) => (
                              <label key={option.key} className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={selectedHighlightOptions.includes(option.key)}
                                  onChange={() => toggleHighlightOption(option.key)}
                                />
                                <span>{option.label} — {option.level}</span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">No highlight options available in this order context.</p>
                        )}
                      </div>
                    ) : null}
                    {renderFieldsByKeys(["minimum_age"])}
                  </div>
                ) : null}

                {!isGiveaway && hasEmbeddedVideo ? (
                  <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                    <h4 className="text-sm font-semibold">D. Conditional premium options</h4>
                    <p className="text-xs text-muted-foreground">This field is available only when the corresponding WooCommerce option was purchased.</p>
                    {renderFieldsByKeys(["embedded_video_link"])}
                  </div>
                ) : null}

                {isGiveaway ? (
                  <>
                    <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                      <h4 className="text-sm font-semibold">E. Publication / timing</h4>
                      <p className="text-xs text-muted-foreground">Dates are derived from your reservation and purchased duration.</p>
                      <p className="text-xs text-muted-foreground">{GIVEAWAY_DATES_HELPER}</p>
                      {renderFieldsByKeys(["start_date", "end_date"])}
                    </div>

                    <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                      <h4 className="text-sm font-semibold">F. Distribution / eligibility</h4>
                      <p className="text-xs text-muted-foreground">Select where you can ship the giveaway prize.</p>
                      {validationError === destinationRequiredMessage ? (
                        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                          {destinationRequiredMessage}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" onClick={selectAllWorld}>Select all world</Button>
                        <Button type="button" variant="outline" onClick={deselectAllWorld}>Deselect all world</Button>
                      </div>
                      <div className="space-y-3">
                        <div className="rounded border bg-white p-3 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Button type="button" variant="outline" className="h-auto p-0 text-sm font-medium" onClick={() => toggleGeoSection("europe")}>
                              {expandedGeoSections.europe ? "▾" : "▸"} Europe
                            </Button>
                            <div className="flex items-center gap-3">
                              {(() => {
                                const state = groupStateLabel(getGroupSelectionState([...COUNTRY_GROUPS.europe.eu, ...COUNTRY_GROUPS.europe.other]));
                                return <span className={`text-xs font-semibold ${state.className}`}>{state.icon} {state.text}</span>;
                              })()}
                              <Button type="button" variant="outline" size="sm" onClick={() => addCountries([...COUNTRY_GROUPS.europe.eu, ...COUNTRY_GROUPS.europe.other])}>Select all</Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => removeCountries([...COUNTRY_GROUPS.europe.eu, ...COUNTRY_GROUPS.europe.other])}>Deselect all</Button>
                            </div>
                          </div>
                          {expandedGeoSections.europe ? (
                            <div className="space-y-3">
                              <div className="rounded border bg-slate-50 p-3 space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <Button type="button" variant="outline" className="h-auto p-0 text-xs font-semibold" onClick={() => toggleGeoSection("europe_eu")}>
                                    {expandedGeoSections.europe_eu ? "▾" : "▸"} European Union
                                  </Button>
                                  <div className="flex items-center gap-3">
                                    {(() => {
                                      const state = groupStateLabel(getGroupSelectionState(COUNTRY_GROUPS.europe.eu));
                                      return <span className={`text-xs font-semibold ${state.className}`}>{state.icon} {state.text}</span>;
                                    })()}
                                    <Button type="button" variant="outline" size="sm" onClick={() => addCountries(COUNTRY_GROUPS.europe.eu)}>Select all</Button>
                                    <Button type="button" variant="outline" size="sm" onClick={() => removeCountries(COUNTRY_GROUPS.europe.eu)}>Deselect all</Button>
                                  </div>
                                </div>
                                {expandedGeoSections.europe_eu ? (
                                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                    {COUNTRY_GROUPS.europe.eu.map((country) => (
                                      <label key={country} className="flex items-center gap-2 text-xs">
                                        <input type="checkbox" checked={selectedShippingCountries.includes(country)} onChange={() => toggleCountry(country)} />
                                        <span>{country}</span>
                                      </label>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                              <div className="rounded border bg-slate-50 p-3 space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <Button type="button" variant="outline" className="h-auto p-0 text-xs font-semibold" onClick={() => toggleGeoSection("europe_other")}>
                                    {expandedGeoSections.europe_other ? "▾" : "▸"} Other European territories
                                  </Button>
                                  <div className="flex items-center gap-3">
                                    {(() => {
                                      const state = groupStateLabel(getGroupSelectionState(COUNTRY_GROUPS.europe.other));
                                      return <span className={`text-xs font-semibold ${state.className}`}>{state.icon} {state.text}</span>;
                                    })()}
                                    <Button type="button" variant="outline" size="sm" onClick={() => addCountries(COUNTRY_GROUPS.europe.other)}>Select all</Button>
                                    <Button type="button" variant="outline" size="sm" onClick={() => removeCountries(COUNTRY_GROUPS.europe.other)}>Deselect all</Button>
                                  </div>
                                </div>
                                {expandedGeoSections.europe_other ? (
                                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                    {COUNTRY_GROUPS.europe.other.map((country) => (
                                      <label key={country} className="flex items-center gap-2 text-xs">
                                        <input type="checkbox" checked={selectedShippingCountries.includes(country)} onChange={() => toggleCountry(country)} />
                                        <span>{country}</span>
                                      </label>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </div>

                        {CONTINENT_LABELS.map((continent) => {
                          const countries = COUNTRY_GROUPS.continents[continent.key];
                          return (
                            <div key={continent.sectionKey} className="rounded border bg-white p-3 space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-auto p-0 text-sm font-medium"
                                  onClick={() => toggleGeoSection(continent.sectionKey)}
                                >
                                  {expandedGeoSections[continent.sectionKey] ? "▾" : "▸"} {continent.label}
                                </Button>
                                <div className="flex items-center gap-3">
                                  {(() => {
                                    const state = groupStateLabel(getGroupSelectionState(countries));
                                    return <span className={`text-xs font-semibold ${state.className}`}>{state.icon} {state.text}</span>;
                                  })()}
                                  <Button type="button" variant="outline" size="sm" onClick={() => addCountries(countries)}>Select all</Button>
                                  <Button type="button" variant="outline" size="sm" onClick={() => removeCountries(countries)}>Deselect all</Button>
                                </div>
                              </div>
                              {expandedGeoSections[continent.sectionKey] ? (
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                  {countries.map((country) => (
                                    <label key={country} className="flex items-center gap-2 text-xs">
                                      <input
                                        type="checkbox"
                                        checked={selectedShippingCountries.includes(country)}
                                        onChange={() => toggleCountry(country)}
                                      />
                                      <span>{country}</span>
                                    </label>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                      <h4 className="text-sm font-semibold">G. Quiz question and answers</h4>
                      {renderFieldsByKeys(["giveaway_question", "answer_correct", "answer_wrong_1", "answer_wrong_2", "answer_wrong_3", "answer_wrong_4"])}
                    </div>
                  </>
                ) : null}

                <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                  <h4 className="text-sm font-semibold">{isGiveaway ? "H. Note to admin" : "Note to admin"}</h4>
                  {isGiveaway ? (
                    <textarea
                      id="notes"
                      name="notes"
                      value={values.notes ?? ""}
                      onChange={(event) => setFieldValue("notes", event.target.value)}
                      rows={4}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                  ) : (
                    renderFieldsByKeys(["notes"])
                  )}
                </div>
              </div>
            ) : (
              safeFieldsToRender.map((field) => renderField(field))
            )}
            {validationError ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{validationError}</div> : null}
            {submitError ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{submitError}</div> : null}
            <Button type="submit" disabled={isSubmitting || !hasConfirmedReservation}>
              {isSubmitting ? "Submitting..." : "Validate form"}
            </Button>
          </form>
        )}
      </section>

      {diag && diagnostic ? (
        <section className="rounded-md border bg-white p-4">
          <h3 className="text-base font-semibold">Runtime Diagnostic (?diag=1)</h3>
          <p className="mt-2 text-xs text-muted-foreground">Frontend runtime markers and raw WordPress order-context payload.</p>
          <pre className="mt-2 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(diagFrontend, null, 2)}</pre>
          <pre className="mt-3 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(diagnostic, null, 2)}</pre>
        </section>
      ) : null}
    </div>
  );
}
