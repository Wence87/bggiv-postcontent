type ProductType = "news" | "promo" | "giveaway" | "ads" | "sponsorship";

export type OrderContextOptionLike = {
  option_key?: string;
  canonical_key?: string;
  display_label?: string;
  selected_value?: string | null;
  selected_value_en?: string | null;
  enabled?: boolean;
};

export type OrderContextLike = {
  product?: {
    product_type?: ProductType;
  };
  options?: OrderContextOptionLike[];
  enabled_options?: string[];
  derived_values?: Record<string, unknown>;
};

export type BusinessOptionSelection = {
  key: string;
  label: string;
  selectedLabel: string;
  selected: boolean;
};

const OPTION_LABELS: Record<string, string> = {
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

const DISPLAY_ORDER = [
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

const NEGATIVE_SELECTION_PATTERNS = [
  "i do not",
  "not selected",
  "no sticky post",
  "cover image only",
  "limit my post to 1,000 characters",
  "not include",
  "without",
  "none",
  "aucun",
  "pas ",
];

export function normalizeOptionKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&amp;|&#0*38;/gi, "&")
    .replace(/&quot;|&#0*34;/gi, "\"")
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;|&#0*60;/gi, "<")
    .replace(/&gt;|&#0*62;/gi, ">")
    .replace(/&nbsp;|&#0*160;/gi, " ");
}

export function stripTrailingPriceFragment(value: string): string {
  const decodedDollar = value.replace(/&#0*36;|&dollar;/gi, "$").replace(/&nbsp;/gi, " ");
  return decodedDollar.replace(/\s*\(\s*\+?\s*\$?\s*[\d\s.,]+(?:\s*[A-Za-z]{3})?\s*\)\s*$/u, "").trim();
}

export function normalizeOptionSelectionLabel(value: string): string {
  return stripTrailingPriceFragment(decodeBasicHtmlEntities(value).replace(/\s+/g, " ").trim());
}

export function canonicalizeBusinessOptionKey(rawKey: string): string {
  const normalized = normalizeOptionKey(rawKey);
  const aliases: Record<string, string> = {
    audienceamplifier: "audience_amplifier",
    multiactionentry: "audience_amplifier",
    giveawayduration: "duration",
    duration: "duration",
    socialboost: "social_boost",
    featuredspotherogrid: "hero_grid",
    featuredspotherogrid7days: "hero_grid",
    featuredspotintheherogrid: "hero_grid",
    herogrid: "hero_grid",
    stickypost: "sticky_post",
    sidebarspotlight: "sidebar_spotlight",
    extendedtextlimit: "extended_text_limit",
    additionalimages: "additional_images",
    embeddedvideo: "embedded_video",
    weeklynewsletterfeature: "weekly_newsletter_feature",
    weeklynewsletter: "weekly_newsletter_feature",
    newsletterfeature: "weekly_newsletter_feature",
  };
  if (aliases[normalized]) return aliases[normalized];
  if (normalized.includes("audienceamplifier") || normalized.includes("multiactionentry")) return "audience_amplifier";
  if (normalized.includes("duration")) return "duration";
  if (normalized.includes("socialboost")) return "social_boost";
  if (normalized.includes("herogrid")) return "hero_grid";
  if (normalized.includes("stickypost")) return "sticky_post";
  if (normalized.includes("sidebarspotlight")) return "sidebar_spotlight";
  if (normalized.includes("extendedtext")) return "extended_text_limit";
  if (normalized.includes("additionalimages")) return "additional_images";
  if (normalized.includes("embeddedvideo")) return "embedded_video";
  if (normalized.includes("newsletter")) return "weekly_newsletter_feature";
  return normalized;
}

export function isPositiveOptionSelection(value: string): boolean {
  const normalized = normalizeOptionSelectionLabel(value).toLowerCase();
  if (!normalized) return false;
  return !NEGATIVE_SELECTION_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function socialBoostAutoSelection(productType?: string): BusinessOptionSelection | null {
  if (productType !== "giveaway" && productType !== "promo") return null;
  return {
    key: "social_boost",
    label: OPTION_LABELS.social_boost,
    selectedLabel: "Social Boost on FB, Insta, X & TikTok",
    selected: true,
  };
}

export function extractBusinessOptionSelections(context: OrderContextLike): BusinessOptionSelection[] {
  const map = new Map<string, BusinessOptionSelection>();
  const options = Array.isArray(context.options) ? context.options : [];

  for (const option of options) {
    const rawKey = option.canonical_key || option.option_key || "";
    const canonical = canonicalizeBusinessOptionKey(rawKey);
    if (!OPTION_LABELS[canonical] || map.has(canonical)) continue;

    const selectedLabel = normalizeOptionSelectionLabel(option.selected_value_en ?? option.selected_value ?? "");
    if (!selectedLabel) continue;

    map.set(canonical, {
      key: canonical,
      label: option.display_label && option.display_label.trim() ? option.display_label.trim() : OPTION_LABELS[canonical],
      selectedLabel,
      selected: isPositiveOptionSelection(selectedLabel),
    });
  }

  const socialBoost = socialBoostAutoSelection(context.product?.product_type);
  if (socialBoost && !map.has("social_boost")) {
    map.set("social_boost", socialBoost);
  }

  return DISPLAY_ORDER.map((key) => map.get(key)).filter((entry): entry is BusinessOptionSelection => Boolean(entry));
}

export function getBusinessOptionSelection(context: OrderContextLike, key: string): BusinessOptionSelection | null {
  const canonical = canonicalizeBusinessOptionKey(key);
  return extractBusinessOptionSelections(context).find((entry) => entry.key === canonical) ?? null;
}

export function hasSelectedBusinessOption(context: OrderContextLike, key: string): boolean {
  return Boolean(getBusinessOptionSelection(context, key)?.selected);
}

export function resolvePostBodyMaxLengthFromContext(context: OrderContextLike): number | null {
  const selection = getBusinessOptionSelection(context, "extended_text_limit");
  if (selection) return selection.selected ? null : 1000;

  const direct = context.derived_values?.post_body_max_length;
  if (typeof direct === "number" && Number.isFinite(direct) && direct > 0) return Math.trunc(direct);
  if (direct === null) return null;
  return 1000;
}
