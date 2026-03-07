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
  { key: "prize_name", label: "Prize name", type: "text", required: true },
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
  { key: "minimum_age", label: "Minimum age", type: "number", required: true, min: 1, max: 120 },
  { key: "giveaway_question", label: "Giveaway question", type: "textarea", required: true },
  { key: "answer_correct", label: "✅ Correct answer", type: "text", required: true },
  { key: "answer_wrong_1", label: "❌ Wrong answer 1", type: "text", required: true },
  { key: "answer_wrong_2", label: "❌ Wrong answer 2", type: "text", required: true },
  { key: "answer_wrong_3", label: "❌ Wrong answer 3", type: "text", required: true },
  { key: "answer_wrong_4", label: "❌ Wrong answer 4", type: "text", required: true },
  { key: "start_date", label: "Start date", type: "date", required: true, readonly: true },
  { key: "end_date", label: "End date", type: "date", required: true, readonly: true },
  { key: "notes", label: "Notes", type: "textarea", required: false },
];

const SHORT_PRODUCT_DESCRIPTION_HELPER =
  "Short text describing the product’s key features.  ✨ All submissions are reviewed by our editorial team before publication and must follow our contributor guidelines.  ✨ 100 to 300 characters maximum.";

const COVER_IMAGE_HELPER =
  "Image size : 1200 × 675 px. Allowed File Extensions : webp, jpg, jpeg. Max File Size : 500 KB. A best practice is to present the game in its best light, placing it in the most appropriate setting to make people visually want to discover it.";

const ADDITIONAL_IMAGES_HELPER =
  "⚠️ By default, your post is illustrated with the cover image only. If the appropriate paid option was selected in the previous step, you can add up to three additional images. To help us place the images correctly in your post item, simply insert the image file names between the relevant paragraphs of your text. Image size : 1200 × 675 px • Allowed File Extensions : webp, jpg, jpeg. Max File Size : 500 KB";

const GIVEAWAY_DATES_HELPER =
  "All dates and times are in Brussels time (Europe/Brussels, UTC+1 / UTC+2 DST). Please note that the duration of the giveaway is determined by the option selected in the previous step. Once your giveaway is approved, it will be displayed in three stages: announced with its upcoming start date, shown as active, and finally presented with the results once it has ended.";

const GIVEAWAY_PRIZE_NAME_HELPER =
  "A giveaway can feature only one type of prize, even if multiple units are offered. If you want to award different kinds of prizes, you must create separate giveaways—one for each prize type.";

const GIVEAWAY_UNITS_HELPER =
  "Each unit corresponds to one winner. Each winner receives exactly one unit. From 5 games, you get 🎁 1 free highlight option at its maximum level. From 10 games, you get 🎁🎁 2 free highlight options at their maximum level. With 20 games, you get 🎁🎁🎁 3 free highlight options at their maximum level.";

const GIVEAWAY_QA_HELPER =
  "Ask a closed-ended question with one single correct answer. Ensure the difficulty is well balanced: the question should encourage players to browse the rules or the campaign (for example) without being frustrating or trivial. The correct answer must be unambiguous, and the wrong answers must be clearly and unquestionably false.";

const CONTINENT_COUNTRIES: Record<string, string[]> = {
  Europe: ["Belgium", "France", "Germany", "Italy", "Spain", "Netherlands", "Portugal", "Sweden", "Poland", "Switzerland", "Austria", "Ireland", "Denmark", "Norway", "Finland"],
  "North America": ["United States", "Canada", "Mexico"],
  "South America": ["Brazil", "Argentina", "Chile", "Colombia", "Peru", "Uruguay"],
  Asia: ["Japan", "South Korea", "China", "Taiwan", "Singapore", "India", "Malaysia", "Thailand", "Philippines", "Indonesia", "Vietnam", "United Arab Emirates", "Saudi Arabia"],
  Africa: ["South Africa", "Morocco", "Tunisia", "Egypt", "Kenya", "Nigeria", "Ghana"],
  Oceania: ["Australia", "New Zealand"],
};

const ALL_COUNTRIES = Array.from(new Set(Object.values(CONTINENT_COUNTRIES).flat())).sort();

type OrderContextResponse = {
  product: {
    product_type: "sponsorship" | "ads" | "news" | "promo" | "giveaway";
    form_id: string;
    product_key: string;
    base_fields: string[];
    form_fields?: ProductFormField[];
  };
  prefill?: {
    company_name?: string;
    contact_email?: string;
  };
  reservation?: {
    ads_duration_weeks?: number | null;
  };
  options: Array<{
    option_key: string;
    business_type: string;
    enabled: boolean;
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

function hasOption(enabledOptions: string[], optionKey: string): boolean {
  return enabledOptions.some((value) => value.toLowerCase() === optionKey.toLowerCase());
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

  for (const [key, value] of Object.entries(derivedValues)) {
    if (!key.toLowerCase().includes("duration")) continue;
    if (typeof value === "number" && value >= 1 && value <= 4) return value * 7;
    if (value && typeof value === "object") {
      const finalValue = (value as Record<string, unknown>).duration_weeks_final;
      if (typeof finalValue === "number" && finalValue >= 1 && finalValue <= 4) return finalValue * 7;
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

  const contextEndpoint = useMemo(
    () => `${WP_BASE_URL}/wp-json/bgg/v1/order-context?token=${encodeURIComponent(token)}`,
    [token]
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
      const durationDays = resolveGiveawayDurationDays(context.derived_values ?? {});
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
  const hasEmbeddedVideo = isPostsProduct && hasOption(currentContext.enabled_options ?? [], "embedded_video");
  const hasAdditionalImages = isPostsProduct && hasOption(currentContext.enabled_options ?? [], "additional_images");
  const giveawayDurationDays = isGiveaway ? resolveGiveawayDurationDays(currentContext.derived_values ?? {}) : 0;
  const giveawayUnitsCount = Number(values.prize_units_count || 0);
  const unlockedHighlightCount = isGiveaway ? computeUnlockedHighlights(giveawayUnitsCount) : 0;
  const availableHighlightOptions = (currentContext.options ?? [])
    .map((entry) => entry.option_key)
    .filter((key) => /featured|spotlight|sticky|social_boost|newsletter/i.test(key));
  const allCountries = ALL_COUNTRIES;
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

  function setFieldValue(key: string, value: string) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  function setFieldFileValue(key: string, file: File | null) {
    setFileValues((previous) => ({ ...previous, [key]: file }));
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

      if (field.key === "body" && values.body) {
        const bodyLength = values.body.trim().length;
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
        setValidationError("Please select at least one eligible country for shipping.");
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
          <p className="text-xs text-muted-foreground">{GIVEAWAY_DATES_HELPER}</p>
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
    const label = `${field.label}${requiredMark}`;

    if (field.type === "textarea") {
      const showBodyCounter = field.key === "body";
      const showShortDescCounter = field.key === "short_product_description";
      const bodyLength = values.body?.length ?? 0;
      const shortLength = values.short_product_description?.length ?? 0;
      return (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={field.key}>{label}</Label>
          <textarea
            id={field.key}
            name={field.key}
            value={values[field.key] ?? ""}
            onChange={(event) => setFieldValue(field.key, event.target.value)}
            required={Boolean(field.required)}
            rows={4}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          {showBodyCounter ? (
            <p className="text-xs text-muted-foreground">
              {bodyLength}/{postBodyMaxLength ?? "unlimited"} characters
            </p>
          ) : null}
          {showShortDescCounter ? (
            <p className="text-xs text-muted-foreground">
              {SHORT_PRODUCT_DESCRIPTION_HELPER} ({shortLength}/300)
            </p>
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
          {field.key === "cover_image_upload" ? (
            <p className="text-xs text-muted-foreground">
              {COVER_IMAGE_HELPER}
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
          <Input
            id={field.key}
            name={field.key}
            type="number"
            min={field.min}
            max={field.max}
            step={1}
            required={Boolean(field.required)}
            value={values[field.key] ?? ""}
            onChange={(event) => setFieldValue(field.key, event.target.value)}
          />
          {field.key === "prize_unit_value_usd" ? (
            <p className="text-xs text-muted-foreground">Per unit. Shipping not included.</p>
          ) : null}
          {field.key === "prize_units_count" ? (
            <p className="text-xs text-muted-foreground">{GIVEAWAY_UNITS_HELPER}</p>
          ) : null}
          {field.key === "minimum_age" ? (
            <p className="text-xs text-muted-foreground">Depending of the laws in your country.</p>
          ) : null}
        </div>
      );
    }

    return (
      <div key={field.key} className="space-y-2">
        <Label htmlFor={field.key}>{label}</Label>
        <Input
          id={field.key}
          name={field.key}
          type={field.type}
          required={Boolean(field.required)}
          maxLength={field.key === "title" ? 150 : undefined}
          value={values[field.key] ?? ""}
          onChange={(event) => setFieldValue(field.key, event.target.value)}
        />
        {field.key === "title" ? (
          <p className="text-xs text-muted-foreground">{(values.title?.length ?? 0)}/150 characters</p>
        ) : null}
        {field.key === "prize_name" ? (
          <p className="text-xs text-muted-foreground">{GIVEAWAY_PRIZE_NAME_HELPER}</p>
        ) : null}
      </div>
    );
  }

  const productType = currentContext.product.product_type;
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
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-slate-300" /> Locked</div>
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-green-200" /> Available</div>
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-blue-300" /> My reservation</div>
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-red-200" /> Full</div>
      </div>
    </div>
  );
  const fieldsToRender = isPostsProduct ? effectivePostsFields : formFields;
  const fieldMap = new Map(fieldsToRender.map((field) => [field.key, field] as const));
  const renderFieldsByKeys = (keys: string[]) =>
    keys
      .map((key) => fieldMap.get(key))
      .filter((field): field is ProductFormField => Boolean(field))
      .map((field) => renderField(field));

  const toggleHighlightOption = (optionKey: string) => {
    setSelectedHighlightOptions((prev) => {
      if (prev.includes(optionKey)) return prev.filter((item) => item !== optionKey);
      if (prev.length >= unlockedHighlightCount) return prev;
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
  const selectAllContinent = (continent: string) =>
    setSelectedShippingCountries((prev) => Array.from(new Set([...prev, ...(CONTINENT_COUNTRIES[continent] ?? [])])));
  const deselectAllContinent = (continent: string) =>
    setSelectedShippingCountries((prev) => prev.filter((country) => !(CONTINENT_COUNTRIES[continent] ?? []).includes(country)));

  return (
    <div className="space-y-6">
      <section className="rounded-md border bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Submission Context</h2>
          <Badge variant="secondary">{productType.toUpperCase()}</Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Form: {currentContext.product.form_id}</p>
        <p className="text-sm text-muted-foreground">Product key: {currentContext.product.product_key}</p>
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
        {fieldsToRender.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No dynamic fields configured for this product yet.</p>
        ) : (
          <form className="mt-4 space-y-4" onSubmit={handleSubmit} noValidate>
            {isPostsProduct ? (
              <div className="space-y-4">
                <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                  <h4 className="text-sm font-semibold">A. Basic product information</h4>
                  <p className="text-xs text-muted-foreground">Provide your company and contact details for editorial follow-up.</p>
                  {renderFieldsByKeys(["company_name", "contact_email"])}
                </div>

                <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                  <h4 className="text-sm font-semibold">B. Visual assets</h4>
                  <p className="text-xs text-muted-foreground">Upload premium visuals for publication.</p>
                  {renderFieldsByKeys(["cover_image_upload"])}
                </div>

                <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                  <h4 className="text-sm font-semibold">C. Main content</h4>
                  <p className="text-xs text-muted-foreground">Craft a clear editorial message for your audience.</p>
                  {renderFieldsByKeys(["title", "body", "short_product_description", "notes"])}
                </div>

                {(hasEmbeddedVideo || hasAdditionalImages) ? (
                  <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                    <h4 className="text-sm font-semibold">D. Conditional premium options</h4>
                    <p className="text-xs text-muted-foreground">These fields are available only when corresponding WooCommerce options were purchased.</p>
                    {hasEmbeddedVideo ? renderFieldsByKeys(["embedded_video_link"]) : null}
                    {hasAdditionalImages ? renderFieldsByKeys(["additional_image_1", "additional_image_2", "additional_image_3"]) : null}
                  </div>
                ) : null}

                {isGiveaway ? (
                  <>
                    <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                      <h4 className="text-sm font-semibold">E. Giveaway details</h4>
                      <p className="text-xs text-muted-foreground">Define prize details and audience requirements.</p>
                      {renderFieldsByKeys(["prize_name", "giveaway_category", "prize_unit_value_usd", "prize_units_count"])}
                    </div>

                    <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                      <h4 className="text-sm font-semibold">F. Publication / timing</h4>
                      <p className="text-xs text-muted-foreground">Dates are derived from your reservation and purchased duration.</p>
                      {renderFieldsByKeys(["start_date", "end_date"])}
                    </div>

                    <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                      <h4 className="text-sm font-semibold">G. Distribution / eligibility</h4>
                      <p className="text-xs text-muted-foreground">Select where you can ship the giveaway prize.</p>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={selectAllWorld}>Select all world</Button>
                        <Button type="button" variant="outline" onClick={deselectAllWorld}>Deselect all world</Button>
                      </div>
                      <div className="space-y-3">
                        {Object.entries(CONTINENT_COUNTRIES).map(([continent, countries]) => (
                          <div key={continent} className="rounded border bg-white p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium">{continent}</p>
                              <div className="flex gap-2">
                                <Button type="button" variant="outline" size="sm" onClick={() => selectAllContinent(continent)}>Select all</Button>
                                <Button type="button" variant="outline" size="sm" onClick={() => deselectAllContinent(continent)}>Deselect all</Button>
                              </div>
                            </div>
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
                          </div>
                        ))}
                      </div>
                      {renderFieldsByKeys(["minimum_age"])}
                    </div>

                    <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                      <h4 className="text-sm font-semibold">H. Quiz question and answers</h4>
                      <p className="text-xs text-muted-foreground">{GIVEAWAY_QA_HELPER}</p>
                      {renderFieldsByKeys(["giveaway_question", "answer_correct", "answer_wrong_1", "answer_wrong_2", "answer_wrong_3", "answer_wrong_4"])}
                    </div>

                    <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                      <h4 className="text-sm font-semibold">D. Conditional premium options</h4>
                      <p className="text-xs text-muted-foreground">
                        Free highlight slots unlocked: {unlockedHighlightCount}
                      </p>
                      {unlockedHighlightCount > 0 && availableHighlightOptions.length > 0 ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {availableHighlightOptions.map((optionKey) => (
                            <label key={optionKey} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={selectedHighlightOptions.includes(optionKey)}
                                onChange={() => toggleHighlightOption(optionKey)}
                                disabled={!selectedHighlightOptions.includes(optionKey) && selectedHighlightOptions.length >= unlockedHighlightCount}
                              />
                              <span>{optionKey.replace(/_/g, " ")}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No free highlight option unlocked yet.</p>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            ) : (
              fieldsToRender.map((field) => renderField(field))
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
          <h3 className="text-base font-semibold">Diagnostic</h3>
          <pre className="mt-2 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(diagnostic, null, 2)}</pre>
        </section>
      ) : null}
    </div>
  );
}
