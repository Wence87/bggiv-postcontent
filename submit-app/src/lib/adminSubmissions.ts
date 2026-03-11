import { EditorialStatus, OrderPaymentStatus, Product, PublicationStatus, type Prisma } from "@prisma/client";

export type SubmissionListRow = {
  id: string;
  submissionId: string;
  productType: string;
  orderNumber: string;
  linkedOrderId: string;
  company: string;
  contactEmail: string;
  reservedSlot: string;
  createdAt: string;
  updatedAt: string;
  paymentStatus: OrderPaymentStatus;
  totalPaid: string;
  vatPaid: string;
  editorialStatus: EditorialStatus;
  publicationStatus: PublicationStatus;
  reviewerAssignee: string;
  purchasedOptionsSummary: string;
  assetsSummary: string;
  hasAssets: boolean;
  orderedOptionKeys: string[];
  orderedOptionValues: Record<string, string>;
  previews: {
    title: string;
    shortDescription: string;
    body: string;
    notes: string;
    quiz: string;
    shipping: string;
    audienceAmplifier: string;
  };
};

const OPTION_KEY_ALIASES: Record<string, string> = {
  audienceamplifier: "audience_amplifier",
  multiactionentry: "audience_amplifier",
  giveawayduration: "duration",
  duration: "duration",
  socialboost: "social_boost",
  featuredspotherogrid: "hero_grid",
  featuredspotintheherogrid: "hero_grid",
  featuredspotintheherogrid7days: "hero_grid",
  herogrid: "hero_grid",
  stickypost: "sticky_post",
  sidebarspotlight: "sidebar_spotlight",
  extendedtextlimit: "extended_text_limit",
  additionalimages: "additional_images",
  embeddedvideo: "embedded_video",
  weeklynewsletter: "weekly_newsletter_feature",
  weeklynewsletterfeature: "weekly_newsletter_feature",
  newsletterfeature: "weekly_newsletter_feature",
  quiz: "quiz",
  shipping: "shipping",
};

function canonicalizeOptionKey(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return OPTION_KEY_ALIASES[normalized] ?? normalized;
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

function stripTrailingPriceFragment(value: string): string {
  const decodedDollar = value.replace(/&#0*36;|&dollar;/gi, "$").replace(/&nbsp;/gi, " ");
  return decodedDollar.replace(/\s*\(\s*\+?\s*\$?\s*[\d\s.,]+(?:\s*[A-Za-z]{3})?\s*\)\s*$/u, "").trim();
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

function normalizeSocialBoostValue(value: string): string {
  const decoded = decodeBasicHtmlEntities(value).replace(/\s+/g, " ").trim();
  return decoded.replace(/\bX\s*&\s*TikTok\b/gi, "X, TikTok");
}

function resolveDurationFallback(context: Record<string, unknown>): string {
  const reservation = safeJsonObject(context.reservation);
  const derivedValues = safeJsonObject(context.derived_values);
  const rawWeeks = reservation.giveaway_duration_weeks ?? derivedValues.giveaway_duration_weeks ?? context.giveaway_duration_weeks;
  const rawDays = derivedValues.giveaway_duration_days ?? context.giveaway_duration_days;
  if (typeof rawWeeks === "number" && rawWeeks >= 1 && rawWeeks <= 4) {
    return `${rawWeeks} Week${rawWeeks > 1 ? "s" : ""}`;
  }
  if (typeof rawDays === "number" && [7, 14, 21, 28].includes(rawDays)) {
    const weeks = rawDays / 7;
    return `${weeks} Week${weeks > 1 ? "s" : ""}`;
  }
  return "Enabled";
}

function resolveOptionValue(canonical: string, option: Record<string, unknown>, context: Record<string, unknown>): string {
  const selectedEn = decodeBasicHtmlEntities(String(option.selected_value_en ?? "")).trim();
  if (selectedEn) {
    return stripTrailingPriceFragment(selectedEn);
  }
  const raw = stripTrailingPriceFragment(decodeBasicHtmlEntities(String(option.selected_value ?? "")).trim());
  const normalizedRaw = raw.toLowerCase();

  if (canonical === "duration") {
    if (raw) {
      const weeks = extractWeeksLabel(raw);
      if (weeks) return weeks;
    }
    return resolveDurationFallback(context);
  }
  if (canonical === "extended_text_limit") return "No character limit";
  if (canonical === "additional_images") return "Up to 3 additional images";
  if (canonical === "hero_grid" || canonical === "sticky_post" || canonical === "sidebar_spotlight") {
    if (raw) {
      const days = extractDaysLabel(raw);
      if (days) return days;
    }
    return "Enabled";
  }
  if (canonical === "social_boost") return raw ? normalizeSocialBoostValue(raw) : "Enabled";
  if (canonical === "embedded_video" || canonical === "weekly_newsletter_feature" || canonical === "audience_amplifier") {
    return raw && !/^\d+$/.test(raw) ? raw : "Enabled";
  }

  if (!raw || /^\d+$/.test(raw)) return "Enabled";
  if (normalizedRaw.includes("illimité")) return "No character limit";
  return raw;
}

function extractOrderedOptionKeys(orderContextJson: Prisma.JsonValue | null): string[] {
  const context = safeJsonObject(orderContextJson);
  const keys = new Set<string>();

  const enabled = Array.isArray(context.enabled_options)
    ? context.enabled_options.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  for (const entry of enabled) {
    keys.add(canonicalizeOptionKey(entry));
  }

  const options = Array.isArray(context.options)
    ? context.options.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
  for (const option of options) {
    const enabledFlag = option.enabled;
    if (enabledFlag === false || enabledFlag === "false" || enabledFlag === 0 || enabledFlag === "0") continue;

    const rawKey = [option.key, option.code, option.slug, option.value, option.label, option.name].find(
      (value) => typeof value === "string" && value.trim().length > 0
    ) as string | undefined;
    if (!rawKey) continue;
    keys.add(canonicalizeOptionKey(rawKey));
  }

  return Array.from(keys);
}

function extractOrderedOptionValues(orderContextJson: Prisma.JsonValue | null): Record<string, string> {
  const context = safeJsonObject(orderContextJson);
  const optionValues = new Map<string, string>();
  const enabledSet = new Set(
    (Array.isArray(context.enabled_options) ? context.enabled_options : [])
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => canonicalizeOptionKey(item))
  );

  const options = Array.isArray(context.options)
    ? context.options.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
  for (const option of options) {
    const enabledFlag = option.enabled;
    const rawKey =
      [option.canonical_key, option.option_key, option.key, option.code, option.slug, option.value, option.label, option.name].find(
        (value) => typeof value === "string" && value.trim().length > 0
      ) as string | undefined;
    if (!rawKey) continue;

    const canonical = canonicalizeOptionKey(rawKey);
    if (!canonical) continue;
    const isEnabled = Boolean(enabledFlag) || enabledSet.has(canonical);
    if (!isEnabled) continue;
    if (optionValues.has(canonical)) continue;

    optionValues.set(canonical, resolveOptionValue(canonical, option, context));
  }

  for (const canonical of enabledSet) {
    if (!optionValues.has(canonical)) optionValues.set(canonical, "Enabled");
  }

  return Object.fromEntries(optionValues);
}

function findNumericInMap(map: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = map[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const normalized = value.replace(",", ".").replace(/[^\d.-]/g, "");
      const parsed = Number.parseFloat(normalized);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function resolvePaymentValues(orderContextJson: Prisma.JsonValue | null): { totalPaid: string; vatPaid: string } {
  const context = safeJsonObject(orderContextJson);
  const order = safeJsonObject(context.order);
  const payment = safeJsonObject(context.payment);
  const totals = safeJsonObject(context.totals);

  const total = findNumericInMap(
    { ...context, ...order, ...payment, ...totals },
    ["total_ex_vat", "subtotal_ex_tax", "total_without_tax", "total_paid_ex_vat", "total"]
  );
  const vat = findNumericInMap(
    { ...context, ...order, ...payment, ...totals },
    ["vat", "vat_amount", "tax", "tax_amount", "total_tax", "tax_total"]
  );

  return {
    totalPaid: total != null ? total.toFixed(2) : "-",
    vatPaid: vat != null ? vat.toFixed(2) : "-",
  };
}

export function normalizeProductEnum(productType: string): Product {
  const upper = productType.toUpperCase();
  if (upper === "SPONSORSHIP") return Product.SPONSORSHIP;
  if (upper === "ADS") return Product.ADS;
  if (upper === "PROMO") return Product.PROMO;
  if (upper === "GIVEAWAY") return Product.GIVEAWAY;
  return Product.NEWS;
}

export function safeJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function summarizePurchasedOptions(submission: {
  formDataJson: Prisma.JsonValue;
  orderContextJson: Prisma.JsonValue | null;
}): string {
  const form = safeJsonObject(submission.formDataJson);
  const enabled = extractOrderedOptionKeys(submission.orderContextJson);

  const selectedHighlights = Array.isArray(form.selected_highlight_options)
    ? form.selected_highlight_options.filter((item): item is string => typeof item === "string")
    : [];

  const audienceEnabled = Boolean(safeJsonObject(form).audience_amplifier_actions);

  const labels = [
    ...enabled,
    ...selectedHighlights.map((item) => `free:${item}`),
    ...(audienceEnabled ? ["Audience Amplifier Configured"] : []),
  ];

  if (!labels.length) return "-";
  if (labels.length <= 3) return labels.join(", ");
  return `${labels.slice(0, 3).join(", ")} +${labels.length - 3}`;
}

export function countAssetFiles(formDataJson: Prisma.JsonValue): number {
  const form = safeJsonObject(formDataJson);
  const assets = [
    "banner_image_upload",
    "cover_image_upload",
    "additional_image_1",
    "additional_image_2",
    "additional_image_3",
  ];
  return assets.reduce((count, key) => {
    const value = form[key];
    if (typeof value === "string" && value.trim()) return count + 1;
    return count;
  }, 0);
}

export function summarizeAssets(submission: {
  bannerImageName: string;
  additionalImage1Name?: string | null;
  additionalImage2Name?: string | null;
  additionalImage3Name?: string | null;
  formDataJson: Prisma.JsonValue;
}): { summary: string; hasAssets: boolean; count: number } {
  const fallbackCount = countAssetFiles(submission.formDataJson);
  const persistedAdditional = [
    submission.additionalImage1Name,
    submission.additionalImage2Name,
    submission.additionalImage3Name,
  ].filter((value) => typeof value === "string" && value.trim().length > 0).length;
  const count = Math.max(fallbackCount, (submission.bannerImageName ? 1 : 0) + persistedAdditional);
  const hasAssets = Boolean(submission.bannerImageName);
  if (!hasAssets) return { summary: "Missing", hasAssets: false, count: 0 };
  return { summary: `${count} file${count > 1 ? "s" : ""}`, hasAssets: true, count };
}

function summarizeQuiz(form: Record<string, unknown>): string {
  const question = typeof form.giveaway_question === "string" ? form.giveaway_question.trim() : "";
  if (!question) return "-";
  const answers = [
    form.answer_correct,
    form.answer_wrong_1,
    form.answer_wrong_2,
    form.answer_wrong_3,
    form.answer_wrong_4,
  ].filter((entry) => typeof entry === "string" && entry.trim().length > 0).length;
  return `${question}${answers ? ` (${answers} answers)` : ""}`;
}

function summarizeShipping(form: Record<string, unknown>): string {
  const raw = form.shipping_countries;
  if (!Array.isArray(raw)) return "-";
  const countries = raw.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  if (!countries.length) return "-";
  if (countries.length <= 3) return countries.join(", ");
  return `${countries.slice(0, 3).join(", ")} +${countries.length - 3}`;
}

function summarizeAudienceAmplifier(form: Record<string, unknown>): string {
  const raw = form.audience_amplifier_actions;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "-";
  const map = raw as Record<string, unknown>;
  const filled = Object.values(map).filter((value) => {
    if (typeof value === "string") return value.trim().length > 0;
    if (!value || typeof value !== "object") return false;
    return Object.values(value as Record<string, unknown>).some((nested) => typeof nested === "string" && nested.trim().length > 0);
  }).length;
  return filled ? `${filled} configured actions` : "-";
}

export function formatReservedSlot(submission: {
  productType: string;
  reservationMonthKey: string | null;
  reservationWeekKey: string | null;
  reservationStartsAt: Date | null;
}): string {
  const product = normalizeProductEnum(submission.productType);
  if (product === Product.SPONSORSHIP) {
    if (!submission.reservationMonthKey) return "-";
    const match = /^(\d{4})-(\d{2})$/.exec(submission.reservationMonthKey);
    if (!match) return submission.reservationMonthKey;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) return submission.reservationMonthKey;
    return new Intl.DateTimeFormat("en-GB", {
      month: "short",
      year: "numeric",
      timeZone: "Europe/Brussels",
    }).format(new Date(Date.UTC(year, month - 1, 1)));
  }
  if (product === Product.ADS) {
    if (!submission.reservationWeekKey) return "-";
    const match = /^(\d{4})-W(\d{2})$/.exec(submission.reservationWeekKey);
    if (!match) return submission.reservationWeekKey;
    return `Week ${Number(match[2])}, ${match[1]}`;
  }
  if (submission.reservationStartsAt) {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Europe/Brussels",
    }).format(submission.reservationStartsAt);
  }
  return "-";
}

export function toListRow(submission: {
  id: string;
  productType: string;
  orderNumber: string | null;
  linkedOrderId: string | null;
  companyName: string;
  contactEmail: string;
  reservationMonthKey: string | null;
  reservationWeekKey: string | null;
  reservationStartsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  bannerImageName: string;
  additionalImage1Name: string | null;
  additionalImage2Name: string | null;
  additionalImage3Name: string | null;
  formDataJson: Prisma.JsonValue;
  orderContextJson: Prisma.JsonValue | null;
  ops: {
    orderPaymentStatus: OrderPaymentStatus;
    editorialStatus: EditorialStatus;
    publicationStatus: PublicationStatus;
    reviewerAssignee: string | null;
  } | null;
}): SubmissionListRow {
  const form = safeJsonObject(submission.formDataJson);
  const assets = summarizeAssets(submission);
  const payment = resolvePaymentValues(submission.orderContextJson);
  const title = typeof form.title === "string" ? form.title.trim() : "-";
  const shortDescription = typeof form.short_product_description === "string" ? form.short_product_description.trim() : "-";
  const body = typeof form.body === "string" ? form.body.trim() : "-";
  const notes = typeof form.notes === "string" ? form.notes.trim() : "-";
  return {
    id: submission.id,
    submissionId: submission.id,
    productType: submission.productType,
    orderNumber: submission.orderNumber ?? "-",
    linkedOrderId: submission.linkedOrderId ?? "-",
    company: submission.companyName,
    contactEmail: submission.contactEmail,
    reservedSlot: formatReservedSlot(submission),
    createdAt: submission.createdAt.toISOString(),
    updatedAt: submission.updatedAt.toISOString(),
    paymentStatus: submission.ops?.orderPaymentStatus ?? OrderPaymentStatus.PAID,
    totalPaid: payment.totalPaid,
    vatPaid: payment.vatPaid,
    editorialStatus: submission.ops?.editorialStatus ?? EditorialStatus.SUBMITTED,
    publicationStatus: submission.ops?.publicationStatus ?? PublicationStatus.NOT_SCHEDULED,
    reviewerAssignee: submission.ops?.reviewerAssignee ?? "-",
    purchasedOptionsSummary: summarizePurchasedOptions(submission),
    assetsSummary: assets.summary,
    hasAssets: assets.hasAssets,
    orderedOptionKeys: extractOrderedOptionKeys(submission.orderContextJson),
    orderedOptionValues: extractOrderedOptionValues(submission.orderContextJson),
    previews: {
      title,
      shortDescription,
      body,
      notes,
      quiz: summarizeQuiz(form),
      shipping: summarizeShipping(form),
      audienceAmplifier: summarizeAudienceAmplifier(form),
    },
  };
}
