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
  editorialStatus: EditorialStatus;
  publicationStatus: PublicationStatus;
  reviewerAssignee: string;
  purchasedOptionsSummary: string;
  assetsSummary: string;
  hasAssets: boolean;
  previews: {
    title: string;
    shortDescription: string;
    body: string;
    quiz: string;
    shipping: string;
    audienceAmplifier: string;
  };
};

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
  const context = safeJsonObject(submission.orderContextJson);
  const form = safeJsonObject(submission.formDataJson);

  const enabled = Array.isArray(context.enabled_options)
    ? context.enabled_options.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

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
  const title = typeof form.title === "string" ? form.title.trim() : "-";
  const shortDescription = typeof form.short_product_description === "string" ? form.short_product_description.trim() : "-";
  const body = typeof form.body === "string" ? form.body.trim() : "-";
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
    editorialStatus: submission.ops?.editorialStatus ?? EditorialStatus.SUBMITTED,
    publicationStatus: submission.ops?.publicationStatus ?? PublicationStatus.NOT_SCHEDULED,
    reviewerAssignee: submission.ops?.reviewerAssignee ?? "-",
    purchasedOptionsSummary: summarizePurchasedOptions(submission),
    assetsSummary: assets.summary,
    hasAssets: assets.hasAssets,
    previews: {
      title,
      shortDescription,
      body,
      quiz: summarizeQuiz(form),
      shipping: summarizeShipping(form),
      audienceAmplifier: summarizeAudienceAmplifier(form),
    },
  };
}
