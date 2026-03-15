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

type CanonicalOptionCopy = {
  positive: string;
  negative: string;
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

const OPTION_COPY: Record<string, CanonicalOptionCopy> = {
  audience_amplifier: {
    positive: "I need extra engagement.",
    negative: "I don't need extra engagement.",
  },
  duration: {
    positive: "4 Weeks",
    negative: "1 Week",
  },
  social_boost: {
    positive: "Social Boost on FB, Insta, X & TikTok",
    negative: "Not selected",
  },
  hero_grid: {
    positive: "Feature my giveaway in the Hero Grid.",
    negative: "Do not feature my giveaway.",
  },
  sticky_post: {
    positive: "Pin my giveaway.",
    negative: "Do not pin my giveaway.",
  },
  sidebar_spotlight: {
    positive: "Highlight my giveaway in the sidebar spotlight.",
    negative: "Do not highlight my giveaway.",
  },
  extended_text_limit: {
    positive: "No character limit.",
    negative: "I limit my post to 1,000 characters.",
  },
  additional_images: {
    positive: "I enrich my post with up to three additional images.",
    negative: "I use the cover image only.",
  },
  embedded_video: {
    positive: "I enhance my post with an embedded video.",
    negative: "I do not include an embedded video.",
  },
  weekly_newsletter_feature: {
    positive: "I feature my giveaway in the weekly newsletter.",
    negative: "I do not feature my giveaway in the weekly newsletter.",
  },
};

const NEGATIVE_SELECTION_PATTERNS = [
  "i do not",
  "i don't",
  "not selected",
  "do not pin",
  "do not feature",
  "do not highlight",
  "i use the cover image only",
  "no sticky post",
  "cover image only",
  "limit my post to 1,000 characters",
  "i don't need extra engagement",
  "not include",
  "without",
  "none",
  "aucun",
  "pas ",
];

const POSITIVE_SELECTION_PATTERNS = [
  "no character limit",
  "unlimited",
  "up to three additional images",
  "up to 3 additional images",
  "embedded video",
  "feature my giveaway in the weekly newsletter",
  "social boost on",
  "4 week",
  "multi-action",
  "pin my giveaway",
  "highlight my giveaway",
];

const PESSIMISTIC_OPTION_KEYS = new Set([
  "extended_text_limit",
  "additional_images",
  "embedded_video",
  "weekly_newsletter_feature",
]);

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
  return stripTrailingPriceFragment(
    decodeBasicHtmlEntities(value)
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/\s+/g, " ")
      .trim()
  );
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
  if (NEGATIVE_SELECTION_PATTERNS.some((pattern) => normalized.includes(pattern))) return false;
  if (/\b\d+\s*(day|days|week|weeks)\b/.test(normalized)) return true;
  if (POSITIVE_SELECTION_PATTERNS.some((pattern) => normalized.includes(pattern))) return true;
  return !NEGATIVE_SELECTION_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function classifyOptionSelection(value: string): "positive" | "negative" | "unknown" {
  const normalized = normalizeOptionSelectionLabel(value).toLowerCase();
  if (!normalized) return "unknown";
  if (NEGATIVE_SELECTION_PATTERNS.some((pattern) => normalized.includes(pattern))) return "negative";
  if (/\b\d+\s*(day|days|week|weeks)\b/.test(normalized)) return "positive";
  if (POSITIVE_SELECTION_PATTERNS.some((pattern) => normalized.includes(pattern))) return "positive";
  return "unknown";
}

function parseBoolish(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (["true", "yes", "enabled", "1", "on"].includes(normalized)) return true;
  if (["false", "no", "disabled", "0", "off"].includes(normalized)) return false;
  return null;
}

function resolveFallbackSelectionLabel(canonical: string, selected: boolean): string {
  const copy = OPTION_COPY[canonical];
  if (!copy) return selected ? "Selected" : "Not selected";
  return selected ? copy.positive : copy.negative;
}

function resolveSelectionState(option: OrderContextOptionLike, canonical: string, enabledSet: Set<string>): BusinessOptionSelection | null {
  const selectedLabel = normalizeOptionSelectionLabel(option.selected_value_en ?? option.selected_value ?? "");
  const explicitEnabled = parseBoolish(option.enabled);
  const selectionClass = selectedLabel ? classifyOptionSelection(selectedLabel) : "unknown";
  const requiresNegativeDefault = PESSIMISTIC_OPTION_KEYS.has(canonical);

  let selected = false;
  if (selectionClass === "positive") {
    selected = true;
  } else if (selectionClass === "negative") {
    selected = false;
  } else if (requiresNegativeDefault) {
    selected = false;
  } else if (explicitEnabled === false) {
    selected = false;
  } else {
    selected = enabledSet.has(canonical);
  }

  let displayLabel = selectedLabel;
  if (explicitEnabled === false && (!displayLabel || selectionClass === "positive")) {
    displayLabel = resolveFallbackSelectionLabel(canonical, false);
  } else if (requiresNegativeDefault && selectionClass !== "positive") {
    displayLabel = resolveFallbackSelectionLabel(canonical, false);
    selected = false;
  } else if (!displayLabel) {
    displayLabel = resolveFallbackSelectionLabel(canonical, selected);
  }

  return {
    key: canonical,
    label: option.display_label && option.display_label.trim() ? option.display_label.trim() : OPTION_LABELS[canonical],
    selectedLabel: displayLabel,
    selected,
  };
}

function scoreSelection(selection: BusinessOptionSelection, option: OrderContextOptionLike): number {
  const explicitEnabled = parseBoolish(option.enabled);
  const selectionClass = selection.selectedLabel ? classifyOptionSelection(selection.selectedLabel) : "unknown";
  let score = selection.selected ? 10 : 0;
  if (selectionClass !== "unknown") score += 8;
  if (explicitEnabled === false) score += 4;
  if (explicitEnabled === true && selectionClass !== "unknown") score += 2;
  if (selection.selectedLabel) score += 2;
  return score;
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
  const scores = new Map<string, number>();
  const options = Array.isArray(context.options) ? context.options : [];
  const enabledSet = new Set(
    (Array.isArray(context.enabled_options) ? context.enabled_options : []).map((entry) => canonicalizeBusinessOptionKey(entry))
  );

  for (const option of options) {
    const rawKey = option.canonical_key || option.option_key || "";
    const canonical = canonicalizeBusinessOptionKey(rawKey);
    if (!OPTION_LABELS[canonical]) continue;

    const resolved = resolveSelectionState(option, canonical, enabledSet);
    if (!resolved) continue;
    const score = scoreSelection(resolved, option);
    const previousScore = scores.get(canonical) ?? Number.NEGATIVE_INFINITY;
    if (score >= previousScore) {
      map.set(canonical, resolved);
      scores.set(canonical, score);
    }
  }

  const socialBoost = socialBoostAutoSelection(context.product?.product_type);
  if (socialBoost && !map.has("social_boost")) {
    map.set("social_boost", socialBoost);
    scores.set("social_boost", 100);
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
