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
  type: "text" | "email" | "url" | "file" | "select" | "date" | "textarea";
  required?: boolean;
  readonly?: boolean;
  accept?: string;
  options?: string[];
  max_length?: number;
};

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

function parsePostBodyMaxLength(context: OrderContextResponse): number | null {
  const defaults = 1000;
  const derived = context.derived_values ?? {};

  const direct = (derived as Record<string, unknown>).post_body_max_length;
  if (typeof direct === "number" && Number.isFinite(direct) && direct > 0) {
    return Math.trunc(direct);
  }

  const isUnlimitedString = (value: string) => {
    const normalized = value.toLowerCase();
    return normalized.includes("illimit") || normalized.includes("unlimit") || normalized.includes("no character limit");
  };

  for (const [key, value] of Object.entries(derived)) {
    const keyLc = key.toLowerCase();
    if (!keyLc.includes("text") && !keyLc.includes("body") && !keyLc.includes("limit")) {
      continue;
    }

    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.trunc(value);
    }

    if (typeof value === "string") {
      if (isUnlimitedString(value)) return null;
      const numericMatch = /(\d{2,6})/.exec(value);
      if (numericMatch) return Number(numericMatch[1]);
    }

    if (value && typeof value === "object") {
      const final = (value as Record<string, unknown>).final;
      if (typeof final === "number" && Number.isFinite(final) && final > 0) {
        return Math.trunc(final);
      }
      if (typeof final === "string") {
        if (isUnlimitedString(final)) return null;
        const numericMatch = /(\d{2,6})/.exec(final);
        if (numericMatch) return Number(numericMatch[1]);
      }
    }
  }

  if (context.enabled_options.some((option) => option.toLowerCase() === "extended_textlimit")) {
    return null;
  }

  return defaults;
}

function mapReservationErrorCode(code: string): string {
  switch (code) {
    case "POST_LEADTIME_LOCKED":
      return "This slot is locked (less than 72h). Please choose another slot.";
    case "HOUR_ALREADY_BOOKED":
      return "This slot is already taken. Please choose another hour.";
    case "PROMO_DAILY_LIMIT":
      return "Promo daily limit reached (2 per day). Please choose another day.";
    case "GIVEAWAY_DAILY_LIMIT":
      return "Giveaway daily limit reached (2 per day). Please choose another day.";
    case "ADS_CAPACITY_REACHED":
      return "Selected week is full. Please choose another week.";
    case "MONTH_ALREADY_BOOKED":
      return "Selected month is already booked. Please choose another month.";
    case "WEEK_LOCKED":
    case "MONTH_LOCKED":
      return "Selected period is locked. Please choose another one.";
    case "RESERVATION_FAILED":
      return "Reservation failed. Please try again.";
    default:
      return code;
  }
}

function productToPostsView(productType: OrderContextResponse["product"]["product_type"]): PublicPostProduct {
  if (productType === "promo") return "PROMO_DEAL";
  if (productType === "giveaway") return "GIVEAWAY";
  return "NEWS";
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
  }, [context, reservationChoice.weekKey, reservationChoice.monthKey, selectedAdsWeek?.weekKey, selectedSponsorshipMonth?.monthKey]);

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
  const formFields = currentContext.product.form_fields ?? [];
  const isPostsProduct =
    currentContext.product.product_type === "news" ||
    currentContext.product.product_type === "promo" ||
    currentContext.product.product_type === "giveaway";
  const postBodyMaxLength = isPostsProduct ? parsePostBodyMaxLength(currentContext) : null;

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
      const rawMessage = reserveError instanceof Error ? reserveError.message : "RESERVATION_FAILED";
      setReservationError(mapReservationErrorCode(rawMessage));
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

    for (const field of formFields) {
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
        const hasValidExtension = lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg");
        if (!hasValidExtension) {
          setValidationError("Invalid image format. Only JPG/JPEG files are allowed.");
          return false;
        }

        if (file.size > 500 * 1024) {
          setValidationError("Image too large. Maximum allowed size is 500 KB.");
          return false;
        }
      }

      if (field.key === "title" && values.title && values.title.length > 150) {
        setValidationError("Title is too long. Maximum allowed length is 150 characters.");
        return false;
      }

      if (field.key === "body" && values.body) {
        if (postBodyMaxLength != null && values.body.length > postBodyMaxLength) {
          setValidationError(`Body is too long. Maximum allowed length is ${postBodyMaxLength} characters.`);
          return false;
        }
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
      const isBody = field.key === "body";
      const bodyCount = isBody ? (values.body?.length ?? 0) : null;
      const bodyMax = isBody ? postBodyMaxLength : null;
      return (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={field.key}>{label}</Label>
          <textarea
            id={field.key}
            name={field.key}
            value={values[field.key] ?? ""}
            onChange={(event) => setFieldValue(field.key, event.target.value)}
            required={Boolean(field.required)}
            maxLength={isBody && bodyMax != null ? bodyMax : undefined}
            rows={4}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          {isBody ? (
            <p className="text-xs text-muted-foreground">
              {bodyCount}/{bodyMax ?? "unlimited"} characters
            </p>
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
              Upload a cover image in JPG/JPEG format only. Maximum file size: 500 KB.
            </p>
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
          <PostsCalendar
            product={productToPostsView(productType)}
            selectedDayKey={selectedPostDayKey}
            onSelectDayKey={setSelectedPostDayKey}
            selectedHour={selectedPostHour}
            onSelectHour={setSelectedPostHour}
            onlyAvailableSelection
          />
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
        {formFields.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No dynamic fields configured for this product yet.</p>
        ) : (
          <form className="mt-4 space-y-4" onSubmit={handleSubmit} noValidate>
            {formFields.map((field) => renderField(field))}
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
