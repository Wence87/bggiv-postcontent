<?php

if (!defined('ABSPATH')) {
    exit;
}

final class BGG_Order_Context_Resolver {
    public static function get_resolution_debug(WC_Order $order, array $product_context): array {
        return [
            'matched_by' => (string) ($product_context['matched_by'] ?? 'none'),
            'matched_value' => (string) ($product_context['matched_value'] ?? ''),
            'order_item_name' => (string) ($product_context['order_item_name'] ?? ''),
            'product_id' => (int) ($product_context['order_product_id'] ?? 0),
            'variation_id' => (int) ($product_context['order_variation_id'] ?? 0),
            'sku' => (string) ($product_context['order_sku'] ?? ''),
            'slug' => (string) ($product_context['order_slug'] ?? ''),
        ];
    }

    public static function resolve_product_context(WC_Order $order, array $config): array {
        $default = [
            'display_name' => '',
            'product_key' => '',
            'product_type' => 'unknown',
            'form_id' => '',
            'base_fields' => [],
            'form_fields' => [],
            'activated_blocks' => [],
            'options' => [],
            'matched_by' => 'none',
            'matched_value' => '',
            'resolution_status' => 'unmatched',
            'order_item_name' => '',
            'order_product_id' => 0,
            'order_variation_id' => 0,
            'order_sku' => '',
            'order_slug' => '',
        ];

        $first_item = self::get_first_order_item($order);
        if (!$first_item instanceof WC_Order_Item_Product) {
            return $default;
        }

        $signals = self::collect_order_product_signals($first_item);
        $default['order_item_name'] = $signals['order_item_name'];
        $default['order_product_id'] = $signals['product_id'];
        $default['order_variation_id'] = $signals['variation_id'];
        $default['order_sku'] = $signals['primary_sku'];
        $default['order_slug'] = $signals['primary_slug'];

        // 1) SKU exact
        foreach ($config['products'] as $candidate) {
            if (!is_array($candidate)) continue;
            $candidateSku = trim((string) ($candidate['sku'] ?? ''));
            if ($candidateSku !== '' && in_array(strtolower($candidateSku), $signals['skus_lc'], true)) {
                return self::build_resolved_context($candidate, $signals, 'sku', $candidateSku);
            }
        }

        // 2) product_id exact
        foreach ($config['products'] as $candidate) {
            if (!is_array($candidate)) continue;
            $candidateProductId = self::candidate_int($candidate, ['product_id', 'woocommerce_product_id', 'wc_product_id']);
            if ($candidateProductId > 0 && $candidateProductId === $signals['product_id']) {
                return self::build_resolved_context($candidate, $signals, 'product_id', (string) $candidateProductId);
            }
        }

        // 3) variation_id exact
        foreach ($config['products'] as $candidate) {
            if (!is_array($candidate)) continue;
            $candidateVariationId = self::candidate_int($candidate, ['variation_id', 'woocommerce_variation_id', 'wc_variation_id']);
            if ($candidateVariationId > 0 && $signals['variation_id'] > 0 && $candidateVariationId === $signals['variation_id']) {
                return self::build_resolved_context($candidate, $signals, 'variation_id', (string) $candidateVariationId);
            }
        }

        // 4) slug exact
        foreach ($config['products'] as $candidate) {
            if (!is_array($candidate)) continue;
            $candidateSlug = trim((string) ($candidate['internal_slug'] ?? ''));
            if ($candidateSlug !== '' && in_array(strtolower($candidateSlug), $signals['slugs_lc'], true)) {
                return self::build_resolved_context($candidate, $signals, 'slug', $candidateSlug);
            }
        }

        // 5) name exact (last resort only)
        foreach ($config['products'] as $candidate) {
            if (!is_array($candidate)) continue;
            $candidateName = trim((string) ($candidate['display_name'] ?? ''));
            if ($candidateName !== '' && in_array(strtolower($candidateName), $signals['names_lc'], true)) {
                return self::build_resolved_context($candidate, $signals, 'name', $candidateName);
            }
        }

        $default['resolution_status'] = 'unmatched';
        return $default;
    }

    public static function resolve_options_context(WC_Order $order, array $product_context): array {
        $options = [];
        $enabled_option_keys = [];
        $derived_values = [];
        $activated_blocks = [];
        if (isset($product_context['activated_blocks']) && is_array($product_context['activated_blocks'])) {
            foreach ($product_context['activated_blocks'] as $block) {
                if (!is_array($block)) continue;
                if (empty($block['name'])) continue;
                $activated_blocks[] = [
                    'name' => (string) ($block['name'] ?? ''),
                    'fields' => (string) ($block['fields'] ?? ''),
                    'validation' => (string) ($block['validation'] ?? ''),
                ];
            }
        }

        $first_item = self::get_first_order_item($order);
        $meta = $first_item instanceof WC_Order_Item_Product ? self::build_item_meta_payload($first_item) : [];

        $configured_options = isset($product_context['options']) && is_array($product_context['options'])
            ? $product_context['options']
            : [];

        if (empty($configured_options)) {
            $product_type = strtolower((string) ($product_context['product_type'] ?? ''));
            if (in_array($product_type, ['news', 'promo', 'giveaway'], true)) {
                $configured_options = self::get_default_posts_options();
            }
        }

        foreach ($configured_options as $option) {
            if (!is_array($option)) {
                continue;
            }

            $match = self::resolve_option_match($option, $meta);
            $option_key = (string) ($option['option_key'] ?? '');
            $canonical_key = self::canonical_option_key(
                $option_key,
                (string) ($option['option_name'] ?? ''),
                (string) ($option['technical_slug'] ?? '')
            );
            $selected_raw = is_string($match['raw_value'])
                ? self::clean_selected_value((string) $match['raw_value'])
                : null;

            $option_payload = [
                'option_key' => $option_key,
                'canonical_key' => $canonical_key,
                'display_label' => self::option_display_label($canonical_key),
                'business_type' => (string) ($option['business_type'] ?? ''),
                'enabled' => (bool) $match['enabled'],
                'selected_value' => $selected_raw,
                'selected_value_en' => self::normalize_selected_value_en($canonical_key, $selected_raw),
            ];

            if (!empty($match['enabled'])) {
                $enabled_option_keys[] = $option_key;

                $activated = isset($option['activated_block']) && is_array($option['activated_block'])
                    ? $option['activated_block']
                    : [];
                if (!empty($activated['name']) && $activated['name'] !== '—') {
                    $activated_blocks[] = [
                        'name' => (string) ($activated['name'] ?? ''),
                        'fields' => (string) ($activated['fields'] ?? ''),
                        'validation' => (string) ($activated['validation'] ?? ''),
                    ];
                }

                $option_name_lc = strtolower((string) ($option['option_name'] ?? ''));
                $derive_rule_lc = strtolower((string) (($option['rules']['derive_rule'] ?? '') ?: ''));
                if (
                    self::contains(strtolower($option_key), 'duration') ||
                    self::contains($option_name_lc, 'duration') ||
                    self::contains($derive_rule_lc, 'durée') ||
                    self::contains($derive_rule_lc, 'duration')
                ) {
                    $derived_values[$option_key] = self::resolve_duration_derived($option, is_string($match['raw_value']) ? $match['raw_value'] : null);
                } else {
                    $rules = isset($option['rules']) && is_array($option['rules']) ? $option['rules'] : [];
                    $values = isset($rules['values']) && is_array($rules['values']) ? $rules['values'] : [];
                    $derived_values[$option_key] = [
                        'final' => $values['final'] ?? null,
                        'paid_additional' => $values['paid_additional'] ?? null,
                    ];
                }
            }

            $options[] = $option_payload;
        }

        $product_type = strtolower((string) ($product_context['product_type'] ?? ''));
        $is_posts_product = in_array($product_type, ['news', 'promo', 'giveaway'], true);
        if ($is_posts_product) {
            $has_extended_text_limit = in_array('extended_textlimit', array_map('strtolower', $enabled_option_keys), true);
            $derived_values['post_body_max_length'] = $has_extended_text_limit ? null : 1000;
        }

        return [
            'options' => $options,
            'enabled_options' => array_values(array_unique($enabled_option_keys)),
            'derived_values' => $derived_values,
            'activated_blocks' => $activated_blocks,
        ];
    }

    private static function get_first_order_item(WC_Order $order): ?WC_Order_Item_Product {
        foreach ($order->get_items() as $item) {
            if ($item instanceof WC_Order_Item_Product) {
                return $item;
            }
        }

        return null;
    }

    private static function get_default_posts_options(): array {
        $config = BGG_Order_Context_Config::load();
        if (!is_array($config) || !isset($config['products']) || !is_array($config['products'])) {
            return [];
        }

        foreach ($config['products'] as $product) {
            if (!is_array($product)) continue;
            $product_type = strtolower((string) ($product['product_type'] ?? ''));
            if ($product_type !== 'news') continue;
            if (isset($product['options']) && is_array($product['options']) && !empty($product['options'])) {
                return $product['options'];
            }
        }

        foreach ($config['products'] as $product) {
            if (!is_array($product)) continue;
            $product_type = strtolower((string) ($product['product_type'] ?? ''));
            if (!in_array($product_type, ['news', 'promo', 'giveaway'], true)) continue;
            if (isset($product['options']) && is_array($product['options']) && !empty($product['options'])) {
                return $product['options'];
            }
        }

        return [];
    }

    private static function collect_order_product_signals(WC_Order_Item_Product $item): array {
        $product = $item->get_product();
        $productId = (int) $item->get_product_id();
        $variationId = (int) $item->get_variation_id();
        $orderItemName = trim((string) $item->get_name());

        $skus = [];
        $slugs = [];
        $names = [];

        if ($orderItemName !== '') {
            $names[] = $orderItemName;
        }

        if ($product instanceof WC_Product) {
            $productSku = trim((string) $product->get_sku());
            if ($productSku !== '') $skus[] = $productSku;

            $productSlug = trim((string) get_post_field('post_name', $product->get_id()));
            if ($productSlug !== '') $slugs[] = $productSlug;

            $productName = trim((string) $product->get_name());
            if ($productName !== '') $names[] = $productName;
        }

        $parentId = $variationId > 0 ? (int) wp_get_post_parent_id($variationId) : 0;
        if ($parentId > 0) {
            $parentProduct = wc_get_product($parentId);
            if ($parentProduct instanceof WC_Product) {
                $parentSku = trim((string) $parentProduct->get_sku());
                if ($parentSku !== '') $skus[] = $parentSku;

                $parentSlug = trim((string) get_post_field('post_name', $parentId));
                if ($parentSlug !== '') $slugs[] = $parentSlug;

                $parentName = trim((string) $parentProduct->get_name());
                if ($parentName !== '') $names[] = $parentName;
            }
        }

        $skus = array_values(array_unique($skus));
        $slugs = array_values(array_unique($slugs));
        $names = array_values(array_unique($names));

        return [
            'order_item_name' => $orderItemName,
            'product_id' => $productId,
            'variation_id' => $variationId,
            'parent_id' => $parentId,
            'primary_sku' => $skus[0] ?? '',
            'primary_slug' => $slugs[0] ?? '',
            'skus_lc' => array_map('strtolower', $skus),
            'slugs_lc' => array_map('strtolower', $slugs),
            'names_lc' => array_map('strtolower', $names),
        ];
    }

    private static function build_resolved_context(array $candidate, array $signals, string $matchedBy, string $matchedValue): array {
        return [
            'display_name' => (string) ($candidate['display_name'] ?? ''),
            'product_key' => (string) ($candidate['product_key'] ?? ''),
            'product_type' => (string) ($candidate['product_type'] ?? 'unknown'),
            'form_id' => (string) ($candidate['form_id'] ?? ''),
            'base_fields' => isset($candidate['base_fields']) && is_array($candidate['base_fields']) ? $candidate['base_fields'] : [],
            'form_fields' => isset($candidate['form_fields']) && is_array($candidate['form_fields']) ? $candidate['form_fields'] : [],
            'activated_blocks' => isset($candidate['activated_blocks']) && is_array($candidate['activated_blocks']) ? $candidate['activated_blocks'] : [],
            'options' => isset($candidate['options']) && is_array($candidate['options']) ? $candidate['options'] : [],
            'matched_by' => $matchedBy,
            'matched_value' => $matchedValue,
            'resolution_status' => 'matched',
            'order_item_name' => (string) ($signals['order_item_name'] ?? ''),
            'order_product_id' => (int) ($signals['product_id'] ?? 0),
            'order_variation_id' => (int) ($signals['variation_id'] ?? 0),
            'order_sku' => (string) ($signals['primary_sku'] ?? ''),
            'order_slug' => (string) ($signals['primary_slug'] ?? ''),
        ];
    }

    private static function candidate_int(array $candidate, array $keys): int {
        foreach ($keys as $key) {
            if (!array_key_exists($key, $candidate)) {
                continue;
            }
            $value = (int) $candidate[$key];
            if ($value > 0) {
                return $value;
            }
        }
        return 0;
    }

    private static function resolve_duration_derived(array $option, ?string $raw_value): array {
        $rules = isset($option['rules']) && is_array($option['rules']) ? $option['rules'] : [];
        $values = isset($rules['values']) && is_array($rules['values']) ? $rules['values'] : [];

        $included = 1;
        $included_from_values = self::extract_duration_weeks((string) ($values['base_included'] ?? ''));
        if ($included_from_values !== null) {
            $included = $included_from_values;
        }

        $purchased = $included;
        if (is_string($raw_value)) {
            $raw_weeks = self::extract_duration_weeks($raw_value);
            if ($raw_weeks !== null) {
                $purchased = $raw_weeks;
            }
        }
        if ($purchased === $included) {
            $purchased_from_values = self::extract_duration_weeks((string) ($values['purchased'] ?? ''));
            if ($purchased_from_values !== null) {
                $purchased = $purchased_from_values;
            }
        }

        $final = max($included, $purchased);
        $paid_additional = max(0, $final - $included);

        return [
            'duration_weeks_included' => $included,
            'duration_weeks_purchased' => $purchased,
            'duration_weeks_paid_additional' => $paid_additional,
            'duration_weeks_final' => $final,
        ];
    }

    private static function resolve_option_match(array $option, array $meta): array {
        $option_key = self::normalize_match_key((string) ($option['option_key'] ?? ''));
        $technical_slug = self::normalize_match_key((string) ($option['technical_slug'] ?? ''));
        $option_name = self::normalize_match_key((string) ($option['option_name'] ?? ''));

        foreach ($meta as $meta_key => $meta_value) {
            $meta_key_norm = self::normalize_match_key((string) $meta_key);
            $raw = is_scalar($meta_value) ? (string) $meta_value : '';
            if ($raw === '') {
                continue;
            }

            $key_match = (
                ($option_key !== '' && $meta_key_norm === $option_key) ||
                ($technical_slug !== '' && $meta_key_norm === $technical_slug) ||
                ($option_name !== '' && $meta_key_norm === $option_name) ||
                self::meta_key_matches_option($meta_key_norm, $option_key, $technical_slug, $option_name)
            );

            // Never match by raw value alone: require key-level relation to avoid cross-option numeric pollution.
            if ($key_match) {
                return [
                    'enabled' => self::option_is_enabled_from_raw_value($option, $raw),
                    'raw_value' => $raw,
                    'meta_key' => (string) $meta_key,
                ];
            }
        }

        return [
            'enabled' => false,
            'raw_value' => null,
            'meta_key' => null,
        ];
    }

    private static function option_is_enabled_from_raw_value(array $option, string $raw_value): bool {
        $raw_value_lc = strtolower(trim($raw_value));
        if ($raw_value_lc === '') {
            return false;
        }

        $source = isset($option['source']) && is_array($option['source']) ? $option['source'] : [];
        $purchased_raw = (string) ($source['purchased_raw'] ?? '');
        foreach (preg_split('/\R+/', $purchased_raw) as $candidate) {
            $candidate = trim((string) $candidate);
            if ($candidate === '') {
                continue;
            }
            if ($raw_value_lc === strtolower($candidate) || self::contains($raw_value_lc, strtolower($candidate))) {
                return true;
            }
        }

        if (preg_match('/\b\d+\b/', $raw_value_lc) === 1) {
            return true;
        }

        if (in_array($raw_value_lc, ['yes', 'true', '1', 'on'], true)) {
            return true;
        }

        if (self::contains($raw_value_lc, 'do not') || self::contains($raw_value_lc, 'none') || self::contains($raw_value_lc, 'no ')) {
            return false;
        }

        return true;
    }

    private static function clean_selected_value(string $raw): string {
        $value = trim($raw);
        if ($value === '') {
            return '';
        }

        // Remove trailing Woo price fragments.
        $value = preg_replace('/\s*\(\+\s*[$€£]\s*[\d.,]+\)\s*$/u', '', $value) ?? $value;
        $value = preg_replace('/\s*\(\s*[\d.,]+\s*[$€£]\s*\)\s*$/u', '', $value) ?? $value;
        $value = trim($value);

        // Normalize known non-English leftovers.
        $lc = strtolower($value);
        if ($lc === 'illimité' || $lc === 'illimite') {
            return 'No character limit';
        }

        return $value;
    }

    private static function canonical_option_key(string $option_key, string $option_name, string $technical_slug): string {
        $candidates = [
            self::normalize_match_key($option_key),
            self::normalize_match_key($option_name),
            self::normalize_match_key($technical_slug),
        ];

        foreach ($candidates as $normalized) {
            if ($normalized === '') continue;
            if (strpos($normalized, 'audienceamplifier') !== false) return 'audience_amplifier';
            if (strpos($normalized, 'multiactionentry') !== false) return 'audience_amplifier';
            if (strpos($normalized, 'duration') !== false) return 'duration';
            if (strpos($normalized, 'socialboost') !== false) return 'social_boost';
            if (strpos($normalized, 'herogrid') !== false || strpos($normalized, 'featuredspot') !== false) return 'hero_grid';
            if (strpos($normalized, 'stickypost') !== false) return 'sticky_post';
            if (strpos($normalized, 'sidebarspotlight') !== false) return 'sidebar_spotlight';
            if (strpos($normalized, 'extendedtext') !== false) return 'extended_text_limit';
            if (strpos($normalized, 'additionalimages') !== false) return 'additional_images';
            if (strpos($normalized, 'embeddedvideo') !== false) return 'embedded_video';
            if (strpos($normalized, 'newsletter') !== false) return 'weekly_newsletter_feature';
        }

        return self::normalize_match_key($option_key);
    }

    private static function option_display_label(string $canonical_key): string {
        $map = [
            'audience_amplifier' => 'Audience Amplifier',
            'duration' => 'Duration',
            'social_boost' => 'Social Boost',
            'hero_grid' => 'Featured Spot in the Hero Grid',
            'sticky_post' => 'Sticky Post',
            'sidebar_spotlight' => 'Sidebar Spotlight',
            'extended_text_limit' => 'Extended Text Limit',
            'additional_images' => 'Additional Images',
            'embedded_video' => 'Embedded Video',
            'weekly_newsletter_feature' => 'Weekly Newsletter Feature',
        ];
        return $map[$canonical_key] ?? '';
    }

    private static function normalize_selected_value_en(string $canonical_key, ?string $selected_raw): ?string {
        $raw = is_string($selected_raw) ? trim($selected_raw) : '';
        $normalized = strtolower($raw);

        if ($canonical_key === 'extended_text_limit') {
            if ($raw === '') {
                return null;
            }
            if (strpos($normalized, '1,000') !== false || strpos($normalized, '1000') !== false) {
                return 'I limit my post to 1,000 characters.';
            }
            if (strpos($normalized, 'illimité') !== false || strpos($normalized, 'illimite') !== false || strpos($normalized, 'no character limit') !== false) {
                return 'No character limit.';
            }
            return 'I limit my post to 1,000 characters.';
        }
        if ($canonical_key === 'additional_images') {
            if ($raw === '') {
                return null;
            }
            if (strpos($normalized, 'cover image only') !== false) {
                return 'I use the cover image only.';
            }
            if (strpos($normalized, 'additional image') !== false) {
                return 'I enrich my post with up to three additional images.';
            }
            return 'I use the cover image only.';
        }
        if ($canonical_key === 'embedded_video' || $canonical_key === 'weekly_newsletter_feature') {
            return 'Enabled';
        }

        if ($canonical_key === 'duration') {
            $weeks = self::extract_weeks_any_locale($raw);
            if ($weeks !== null) return $weeks . ' Week' . ($weeks > 1 ? 's' : '');
            return null;
        }

        if (in_array($canonical_key, ['hero_grid', 'sticky_post', 'sidebar_spotlight'], true)) {
            $days = self::extract_days_any_locale($raw);
            if ($days !== null) return $days . ' Day' . ($days > 1 ? 's' : '');
            return null;
        }

        if ($raw === '' || preg_match('/^\d+$/', $raw) === 1) {
            return null;
        }
        if ($normalized === 'illimité' || $normalized === 'illimite') {
            return 'No character limit';
        }
        if (strpos($normalized, 'de ') !== false && strpos($normalized, 'jour') !== false) {
            return null;
        }

        return $raw;
    }

    private static function extract_weeks_any_locale(string $raw): ?int {
        $raw = strtolower(trim($raw));
        if ($raw === '') return null;
        if (preg_match('/\b([1-4])\s*(week|weeks|semaine|semaines)\b/u', $raw, $m) === 1) {
            return (int) $m[1];
        }
        if (preg_match('/\b(7|14|21|28)\s*(day|days|jour|jours)\b/u', $raw, $m) === 1) {
            return (int) ((int) $m[1] / 7);
        }
        return null;
    }

    private static function extract_days_any_locale(string $raw): ?int {
        $raw = strtolower(trim($raw));
        if ($raw === '') return null;
        if (preg_match('/\b(1|2|3|4|5|6|7|14|21|28)\s*(day|days|jour|jours)\b/u', $raw, $m) === 1) {
            return (int) $m[1];
        }
        if (preg_match('/\b([1-4])\s*(week|weeks|semaine|semaines)\b/u', $raw, $m) === 1) {
            return (int) $m[1] * 7;
        }
        return null;
    }

    private static function extract_duration_weeks(string $raw): ?int {
        $raw = trim(strtolower($raw));
        if ($raw === '') {
            return null;
        }

        if (preg_match('/\b(1|2|3|4)\s*week/i', $raw, $m) === 1) {
            return (int) $m[1];
        }
        if (preg_match('/\b(7|14|21|28)\s*day/i', $raw, $m) === 1) {
            return (int) ((int) $m[1] / 7);
        }

        // Last-resort scalar values, still constrained to 1..4.
        if (preg_match('/\b([1-4])\b/', $raw, $m) === 1) {
            return (int) $m[1];
        }

        return null;
    }

    private static function meta_key_matches_option(string $meta_key_norm, string $option_key, string $technical_slug, string $option_name): bool {
        if ($meta_key_norm === '') {
            return false;
        }

        $candidates = array_filter([$option_key, $technical_slug, $option_name], static fn($v) => $v !== '');
        foreach ($candidates as $candidate) {
            if ($candidate === $meta_key_norm) {
                return true;
            }
            if (strpos($meta_key_norm, $candidate) !== false || strpos($candidate, $meta_key_norm) !== false) {
                return true;
            }
        }

        // Duration options often come through as pa_duration / attribute_pa_duration.
        if (strpos($option_key, 'duration') !== false || strpos($technical_slug, 'duration') !== false || strpos($option_name, 'duration') !== false) {
            return strpos($meta_key_norm, 'duration') !== false;
        }

        return false;
    }

    private static function build_item_meta_payload(WC_Order_Item_Product $item): array {
        $meta_payload = [];
        $max_meta_entries = 20;

        foreach ($item->get_meta_data() as $meta) {
            if (!isset($meta->key)) {
                continue;
            }

            $key = (string) $meta->key;
            if ($key === '' || self::starts_with($key, '_')) {
                continue;
            }

            $value = $meta->value ?? null;
            if (!is_scalar($value)) {
                continue;
            }

            if (is_string($value)) {
                $value = substr($value, 0, 300);
            } elseif (is_bool($value)) {
                $value = (bool) $value;
            } elseif (is_int($value) || is_float($value)) {
                $value = $value + 0;
            } else {
                continue;
            }

            $meta_payload[$key] = $value;

            if (count($meta_payload) >= $max_meta_entries) {
                break;
            }
        }

        return $meta_payload;
    }

    private static function normalize_match_key(string $value): string {
        $value = strtolower(trim($value));
        $value = preg_replace('/[^a-z0-9]+/', '_', $value);
        return trim((string) $value, '_');
    }

    private static function starts_with(string $haystack, string $needle): bool {
        if ($needle === '') {
            return true;
        }

        return substr($haystack, 0, strlen($needle)) === $needle;
    }

    private static function contains(string $haystack, string $needle): bool {
        if ($needle === '') {
            return true;
        }

        return strpos($haystack, $needle) !== false;
    }
}
