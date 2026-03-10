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
  const keys = ["additional_image_1", "additional_image_2", "additional_image_3"];
  let count = 1;
  for (const key of keys) {
    const value = form[key];
    if (typeof value === "string" && value.trim()) count += 1;
  }
  return count;
}

export function summarizeAssets(submission: {
  bannerImageName: string;
  formDataJson: Prisma.JsonValue;
}): { summary: string; hasAssets: boolean; count: number } {
  const count = countAssetFiles(submission.formDataJson);
  const hasAssets = Boolean(submission.bannerImageName);
  if (!hasAssets) return { summary: "Missing", hasAssets: false, count: 0 };
  return { summary: `${count} file${count > 1 ? "s" : ""}`, hasAssets: true, count };
}

export function formatReservedSlot(submission: {
  productType: string;
  reservationMonthKey: string | null;
  reservationWeekKey: string | null;
  reservationStartsAt: Date | null;
}): string {
  const product = normalizeProductEnum(submission.productType);
  if (product === Product.SPONSORSHIP) return submission.reservationMonthKey ?? "-";
  if (product === Product.ADS) return submission.reservationWeekKey ?? "-";
  if (submission.reservationStartsAt) return submission.reservationStartsAt.toISOString();
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
  formDataJson: Prisma.JsonValue;
  orderContextJson: Prisma.JsonValue | null;
  ops: {
    orderPaymentStatus: OrderPaymentStatus;
    editorialStatus: EditorialStatus;
    publicationStatus: PublicationStatus;
    reviewerAssignee: string | null;
  } | null;
}): SubmissionListRow {
  const assets = summarizeAssets(submission);
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
  };
}
