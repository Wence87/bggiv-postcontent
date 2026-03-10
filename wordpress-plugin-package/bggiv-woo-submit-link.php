<?php
/**
 * Plugin Name: BGGIV Woo Submit Link
 * Description: Generates signed submit links for calendar.boardgamegiveaways.com after WooCommerce orders move to processing. Requires product_cat slugs: sponsoring, advertisings, news-post, promo-deal-post, giveaways-post.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!defined('BGGIV_SUBMIT_BASE_URL')) {
    define('BGGIV_SUBMIT_BASE_URL', 'https://submit.boardgamegiveaways.com/submit');
}

if (!defined('BGGIV_TOKEN_SECRET')) {
    define('BGGIV_TOKEN_SECRET', '69dfe66b6722bd303953fa85d49add2a530b866ff2428470cf2e8f5f7639a655');
}

final class BGGIV_Woo_Submit_Link {
    private const META_LINK = '_bggiv_submit_link';
    private const ORDER_CONTEXT_CONFIG_PATH = __DIR__ . '/config/order-context.config.json';

    public static function init(): void {
        add_action('woocommerce_order_status_processing', [self::class, 'on_order_processing'], 10, 1);
        add_action('woocommerce_thankyou', [self::class, 'render_thank_you_link'], 20, 1);
        add_action('woocommerce_email_after_order_table', [self::class, 'render_email_link'], 20, 4);
        add_filter('woocommerce_my_account_my_orders_actions', [self::class, 'add_my_account_action'], 20, 2);
        add_action('rest_api_init', [self::class, 'register_rest_routes']);
    }

    public static function register_rest_routes(): void {
        register_rest_route(
            'bgg/v1',
            '/order-context',
            [
                'methods' => 'GET',
                'callback' => [self::class, 'get_order_context'],
                'permission_callback' => '__return_true',
            ]
        );
    }

    public static function get_order_context(WP_REST_Request $request) {
        $order_id = absint((string) $request->get_param('order_id'));
        $order_key = (string) $request->get_param('order_key');

        if (!$order_id || $order_key === '') {
            return new WP_Error('missing_params', 'order_id and order_key are required.', ['status' => 400]);
        }

        $order = wc_get_order($order_id);
        if (!$order instanceof WC_Order) {
            return new WP_Error('order_not_found', 'Order not found.', ['status' => 404]);
        }

        if (!hash_equals((string) $order->get_order_key(), $order_key)) {
            return new WP_Error('invalid_order_key', 'Invalid order key.', ['status' => 403]);
        }

        $config = self::load_order_context_config();
        if (!$config) {
            return new WP_Error('config_missing', 'Order context configuration is missing or invalid.', ['status' => 500]);
        }

        $line_items = self::build_line_items_payload($order);
        $product_context = self::resolve_order_product_context($order, $config);
        $options_context = self::resolve_order_options_context($line_items, $product_context);

        $response = [
            'order' => [
                'order_id' => (string) $order->get_id(),
                'order_key' => (string) $order->get_order_key(),
                'status' => (string) $order->get_status(),
                'currency' => (string) $order->get_currency(),
                'order_total' => $order->get_total(),
                'product_name' => $product_context['display_name'],
            ],
            'product' => [
                'product_type' => $product_context['product_type'],
                'form_id' => $product_context['form_id'],
                'product_key' => $product_context['product_key'],
                'base_fields' => $product_context['base_fields'],
            ],
            'options' => $options_context['options'],
            'enabled_options' => $options_context['enabled_options'],
            'derived_values' => $options_context['derived_values'],
            'activated_blocks' => $options_context['activated_blocks'],
            'line_items' => $line_items,
            'config_version' => $config['version'] ?? null,
            'config_generated_at' => $config['generated_at'] ?? null,
        ];

        return rest_ensure_response($response);
    }

    public static function on_order_processing(int $order_id): void {
        $order = wc_get_order($order_id);
        if (!$order instanceof WC_Order) {
            return;
        }

        self::ensure_submit_link($order);
    }

    public static function render_thank_you_link(int $order_id): void {
        $order = wc_get_order($order_id);
        if (!$order instanceof WC_Order || !$order->has_status('processing')) {
            return;
        }

        $link = self::ensure_submit_link($order);
        if (!$link) {
            return;
        }

        echo '<p><a class="button alt" href="' . esc_url($link) . '">Continue to submission</a></p>';
        echo '<script>setTimeout(function(){window.location.href=' . wp_json_encode($link) . ';}, 4000);</script>';
    }

    public static function render_email_link(WC_Order $order, bool $sent_to_admin, bool $plain_text, WC_Email $email): void {
        if ($sent_to_admin || !$order->has_status('processing')) {
            return;
        }

        $link = self::ensure_submit_link($order);
        if (!$link) {
            return;
        }

        if ($plain_text) {
            echo "\nComplete your submission: " . esc_url_raw($link) . "\n";
            return;
        }

        echo '<p>Complete your submission: <a href="' . esc_url($link) . '">' . esc_html($link) . '</a></p>';
    }

    public static function add_my_account_action(array $actions, WC_Order $order): array {
        if (!$order->has_status('processing')) {
            return $actions;
        }

        $link = self::ensure_submit_link($order);
        if (!$link) {
            return $actions;
        }

        $actions['bggiv_complete_submission'] = [
            'url'  => $link,
            'name' => __('Complete submission', 'bggiv'),
        ];

        return $actions;
    }

    private static function ensure_submit_link(WC_Order $order): ?string {
        // Prefer hardened short-lived token flow when the hardened plugin is available.
        if (class_exists('BGG_Order_Context_Token') && class_exists('BGG_Order_Context_REST')) {
            if (!BGG_Order_Context_REST::is_allowed_order_status((string) $order->get_status())) {
                return null;
            }

            $issued = BGG_Order_Context_Token::issue_for_order((int) $order->get_id());
            $token = (string) ($issued['token'] ?? '');
            if ($token === '') {
                return null;
            }

            return trailingslashit(BGGIV_SUBMIT_BASE_URL) . '?token=' . rawurlencode($token);
        }

        $existing = $order->get_meta(self::META_LINK, true);
        if (is_string($existing) && $existing !== '') {
            return $existing;
        }

        $payload = self::build_payload($order);
        if (!$payload) {
            return null;
        }

        $token = self::encode_token($payload);
        $link = trailingslashit(BGGIV_SUBMIT_BASE_URL) . '?token=' . rawurlencode($token);
        $order->update_meta_data(self::META_LINK, $link);
        $order->save();

        return $link;
    }

    private static function build_payload(WC_Order $order): ?array {
        $mapping = self::detect_product_type($order);
        if (!$mapping) {
            return null;
        }

        $product_name = '';
        $line_items = self::build_line_items_payload($order);
        if (!empty($line_items)) {
            $product_name = (string) ($line_items[0]['name'] ?? '');
        }

        $iat = time();
        $payload = [
            'order_id' => (string) $order->get_id(),
            'order_key' => (string) $order->get_order_key(),
            'email' => (string) $order->get_billing_email(),
            'product_type' => $mapping['product_type'],
            'duration_weeks' => $mapping['duration_weeks'],
            'product_name' => $product_name,
            'order_total' => $order->get_total(),
            'currency' => (string) $order->get_currency(),
            'line_items' => $line_items,
            'iat' => $iat,
            'exp' => $iat + (30 * DAY_IN_SECONDS),
        ];

        return apply_filters('bggiv_wc_order_payload', $payload, $order);
    }

    private static function build_line_items_payload(WC_Order $order): array {
        $items_payload = [];

        foreach ($order->get_items() as $item) {
            if (!$item instanceof WC_Order_Item_Product) {
                continue;
            }

            $product = $item->get_product();
            $attributes = [];
            $sku = '';

            if ($product instanceof WC_Product) {
                if ($product->is_type('variation')) {
                    $attributes = $product->get_attributes();
                }
                $sku = (string) $product->get_sku();
            }

            $items_payload[] = [
                'product_id' => (int) $item->get_product_id(),
                'variation_id' => (int) $item->get_variation_id(),
                'name' => (string) $item->get_name(),
                'qty' => (int) $item->get_quantity(),
                'sku' => $sku,
                'subtotal' => $item->get_subtotal(),
                'total' => $item->get_total(),
                'attributes' => $attributes,
                'meta' => self::build_item_meta_payload($item),
            ];
        }

        return $items_payload;
    }

    private static function load_order_context_config(): ?array {
        if (!file_exists(self::ORDER_CONTEXT_CONFIG_PATH)) {
            return null;
        }

        $raw = file_get_contents(self::ORDER_CONTEXT_CONFIG_PATH);
        if ($raw === false || $raw === '') {
            return null;
        }

        $decoded = json_decode($raw, true);
        if (!is_array($decoded) || !isset($decoded['products']) || !is_array($decoded['products'])) {
            return null;
        }

        return $decoded;
    }

    private static function normalize_match_key(string $value): string {
        $value = strtolower(trim($value));
        $value = preg_replace('/[^a-z0-9]+/', '_', $value);
        return trim((string) $value, '_');
    }

    private static function resolve_order_product_context(WC_Order $order, array $config): array {
        $default = [
            'display_name' => '',
            'product_key' => '',
            'product_type' => self::detect_product_type($order)['product_type'] ?? 'news',
            'form_id' => '',
            'base_fields' => [],
            'options' => [],
        ];

        $first_item = null;
        foreach ($order->get_items() as $item) {
            if ($item instanceof WC_Order_Item_Product) {
                $first_item = $item;
                break;
            }
        }
        if (!$first_item instanceof WC_Order_Item_Product) {
            return $default;
        }

        $product = $first_item->get_product();
        $name = (string) $first_item->get_name();
        $slug = '';
        $sku = '';
        if ($product instanceof WC_Product) {
            $sku = (string) $product->get_sku();
            $slug = (string) get_post_field('post_name', $product->get_id());
        }

        $nameKey = self::normalize_match_key($name);
        $slugKey = self::normalize_match_key($slug);

        foreach ($config['products'] as $candidate) {
            $candidate_name_key = self::normalize_match_key((string) ($candidate['display_name'] ?? ''));
            $candidate_slug_key = self::normalize_match_key((string) ($candidate['internal_slug'] ?? ''));
            $candidate_sku = (string) ($candidate['sku'] ?? '');

            if (
                ($candidate_sku !== '' && $candidate_sku === $sku) ||
                ($candidate_name_key !== '' && $candidate_name_key === $nameKey) ||
                ($candidate_slug_key !== '' && $candidate_slug_key === $slugKey)
            ) {
                return [
                    'display_name' => (string) ($candidate['display_name'] ?? $name),
                    'product_key' => (string) ($candidate['product_key'] ?? ''),
                    'product_type' => (string) ($candidate['product_type'] ?? $default['product_type']),
                    'form_id' => (string) ($candidate['form_id'] ?? ''),
                    'base_fields' => isset($candidate['base_fields']) && is_array($candidate['base_fields']) ? $candidate['base_fields'] : [],
                    'options' => isset($candidate['options']) && is_array($candidate['options']) ? $candidate['options'] : [],
                ];
            }
        }

        return $default;
    }

    private static function option_is_enabled_from_raw_value(array $option, string $raw_value): bool {
        $raw_value_lc = strtolower(trim($raw_value));
        if ($raw_value_lc === '') {
            return false;
        }

        $source = isset($option['source']) && is_array($option['source']) ? $option['source'] : [];
        $purchased_raw = (string) ($source['purchased_raw'] ?? '');
        foreach (preg_split('/\\R+/', $purchased_raw) as $candidate) {
            $candidate = trim((string) $candidate);
            if ($candidate === '') {
                continue;
            }
            if ($raw_value_lc === strtolower($candidate) || str_contains($raw_value_lc, strtolower($candidate))) {
                return true;
            }
        }

        if (preg_match('/\\b\\d+\\b/', $raw_value_lc) === 1) {
            return true;
        }

        if (in_array($raw_value_lc, ['yes', 'true', '1', 'on'], true)) {
            return true;
        }

        if (str_contains($raw_value_lc, 'do not') || str_contains($raw_value_lc, 'none') || str_contains($raw_value_lc, 'no ')) {
            return false;
        }

        return true;
    }

    private static function resolve_option_match(array $option, array $line_item): array {
        $option_key = self::normalize_match_key((string) ($option['option_key'] ?? ''));
        $technical_slug = self::normalize_match_key((string) ($option['technical_slug'] ?? ''));
        $option_name = self::normalize_match_key((string) ($option['option_name'] ?? ''));
        $meta = isset($line_item['meta']) && is_array($line_item['meta']) ? $line_item['meta'] : [];

        foreach ($meta as $meta_key => $meta_value) {
            $meta_key_norm = self::normalize_match_key((string) $meta_key);
            $raw = is_scalar($meta_value) ? (string) $meta_value : '';
            if ($raw === '') {
                continue;
            }

            $key_match = (
                ($option_key !== '' && $meta_key_norm === $option_key) ||
                ($technical_slug !== '' && $meta_key_norm === $technical_slug) ||
                ($option_name !== '' && $meta_key_norm === $option_name)
            );

            if ($key_match || self::option_is_enabled_from_raw_value($option, $raw)) {
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

    private static function resolve_duration_derived(array $option, ?string $raw_value): array {
        $rules = isset($option['rules']) && is_array($option['rules']) ? $option['rules'] : [];
        $values = isset($rules['values']) && is_array($rules['values']) ? $rules['values'] : [];

        $included = 1;
        if (isset($values['base_included']) && preg_match('/(\\d+)/', (string) $values['base_included'], $m) === 1) {
            $included = max(1, (int) $m[1]);
        }

        $purchased = $included;
        if (is_string($raw_value) && preg_match('/(\\d+)/', $raw_value, $m) === 1) {
            $purchased = max(1, (int) $m[1]);
        } elseif (isset($values['purchased']) && preg_match('/(\\d+)/', (string) $values['purchased'], $m) === 1) {
            $purchased = max(1, (int) $m[1]);
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

    private static function resolve_order_options_context(array $line_items, array $product_context): array {
        $options = [];
        $enabled_option_keys = [];
        $derived_values = [];
        $activated_blocks = [];

        $first_item = $line_items[0] ?? ['meta' => []];
        $configured_options = isset($product_context['options']) && is_array($product_context['options'])
            ? $product_context['options']
            : [];

        foreach ($configured_options as $option) {
            if (!is_array($option)) {
                continue;
            }

            $match = self::resolve_option_match($option, $first_item);
            $option_key = (string) ($option['option_key'] ?? '');

            $option_payload = [
                'option_key' => $option_key,
                'option_name' => (string) ($option['option_name'] ?? ''),
                'business_type' => (string) ($option['business_type'] ?? ''),
                'enabled' => $match['enabled'],
                'raw_value' => $match['raw_value'],
                'meta_key' => $match['meta_key'],
                'rules' => isset($option['rules']) && is_array($option['rules']) ? $option['rules'] : [],
            ];

            if ($match['enabled']) {
                $enabled_option_keys[] = $option_key;

                $activated = isset($option['activated_block']) && is_array($option['activated_block'])
                    ? $option['activated_block']
                    : [];
                if (!empty($activated['name']) && $activated['name'] !== '—') {
                    $activated_blocks[] = $activated;
                }

                $option_name_lc = strtolower((string) ($option['option_name'] ?? ''));
                $derive_rule_lc = strtolower((string) (($option['rules']['derive_rule'] ?? '') ?: ''));
                if (str_contains(strtolower($option_key), 'duration') || str_contains($option_name_lc, 'duration') || str_contains($derive_rule_lc, 'durée') || str_contains($derive_rule_lc, 'duration')) {
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

        return [
            'options' => $options,
            'enabled_options' => $enabled_option_keys,
            'derived_values' => $derived_values,
            'activated_blocks' => $activated_blocks,
        ];
    }

    private static function build_item_meta_payload(WC_Order_Item_Product $item): array {
        $meta_payload = [];
        $max_meta_entries = 20;

        foreach ($item->get_meta_data() as $meta) {
            if (!isset($meta->key)) {
                continue;
            }

            $key = (string) $meta->key;
            if ($key === '' || str_starts_with($key, '_')) {
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

    private static function detect_product_type(WC_Order $order): ?array {
        $detected = null;
        $duration_weeks = null;

        foreach ($order->get_items() as $item) {
            if (!$item instanceof WC_Order_Item_Product) {
                continue;
            }

            $product = $item->get_product();
            if (!$product instanceof WC_Product) {
                continue;
            }

            $product_id = $product->get_id();

            // Detect by product category slug (robust)
            if (has_term('sponsoring', 'product_cat', $product_id)) {
                $detected = 'sponsorship';
            } elseif (has_term('advertisings', 'product_cat', $product_id)) {
                $detected = 'ads';
            } elseif (has_term('news-post', 'product_cat', $product_id)) {
                $detected = 'news';
            } elseif (has_term('promo-deal-post', 'product_cat', $product_id)) {
                $detected = 'promo';
            } elseif (has_term('giveaways-post', 'product_cat', $product_id)) {
                $detected = 'giveaway';

                // Duration weeks (1..4). Prefer order item meta, then variation attributes.
                $raw = $item->get_meta('duration_weeks', true);

                if (!$raw) {
                    // common Woo patterns for variations/attributes
                    $raw = $item->get_meta('pa_duration', true)
                        ?: $item->get_meta('attribute_pa_duration', true)
                        ?: $item->get_meta('duration', true)
                        ?: $item->get_meta('attribute_duration', true);
                }

                $duration_weeks = (int) $raw;
                if ($duration_weeks < 1 || $duration_weeks > 4) {
                    $duration_weeks = 1;
                }
            }

            if ($detected) {
                break;
            }
        }

        if (!$detected) {
            return null;
        }

        return [
            'product_type'   => $detected,
            'duration_weeks' => $detected === 'giveaway' ? $duration_weeks : null,
        ];
    }

    private static function encode_token(array $payload): string {
        $json = wp_json_encode($payload);
        $payload_b64 = self::base64url_encode($json);
        $signature = hash_hmac('sha256', $payload_b64, BGGIV_TOKEN_SECRET);
        return $payload_b64 . '.' . $signature;
    }

    private static function base64url_encode(string $input): string {
        return rtrim(strtr(base64_encode($input), '+/', '-_'), '=');
    }
}

BGGIV_Woo_Submit_Link::init();
