<?php

if (!defined('ABSPATH')) {
    exit;
}

final class BGG_Order_Context_REST {
    private const ALLOWED_ORIGIN = 'https://submit.boardgamegiveaways.com';

    public static function register_routes(): void {
        register_rest_route(
            'bgg/v1',
            '/order-context-token',
            [
                'methods' => WP_REST_Server::CREATABLE,
                'callback' => [self::class, 'issue_order_context_token'],
                'permission_callback' => '__return_true',
                'args' => [
                    'order_id' => [
                        'required' => true,
                        'type' => 'integer',
                        'sanitize_callback' => 'absint',
                    ],
                    'order_key' => [
                        'required' => true,
                        'type' => 'string',
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                ],
            ]
        );

        register_rest_route(
            'bgg/v1',
            '/order-context',
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [self::class, 'get_order_context'],
                'permission_callback' => '__return_true',
                'args' => [
                    'token' => [
                        'required' => true,
                        'type' => 'string',
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                    'diag' => [
                        'required' => false,
                        'type' => 'string',
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                ],
            ]
        );
    }

    public static function issue_order_context_token(WP_REST_Request $request) {
        if (!class_exists('WooCommerce')) {
            self::debug_log('woocommerce_missing', ['route' => 'order-context-token']);
            return new WP_Error('woocommerce_missing', 'WooCommerce is required.', ['status' => 500]);
        }

        $origin_error = self::ensure_allowed_origin($request);
        if ($origin_error instanceof WP_Error) {
            return $origin_error;
        }

        $ip = BGG_Order_Context_Rate_Limit::get_client_ip();
        if (!self::allow_request($ip, 'token_issue')) {
            self::debug_log('rate_limited', ['route' => 'order-context-token', 'ip' => $ip]);
            return new WP_Error('rate_limited', 'Too many requests.', ['status' => 429]);
        }

        $order_id = absint((string) $request->get_param('order_id'));
        $order_key = (string) $request->get_param('order_key');

        if (!$order_id || $order_key === '') {
            BGG_Order_Context_Rate_Limit::mark_invalid('order', $ip);
            self::debug_log('missing_params', ['route' => 'order-context-token', 'ip' => $ip]);
            return new WP_Error('missing_params', 'order_id and order_key are required.', ['status' => 400]);
        }

        $order = wc_get_order($order_id);
        if (!$order instanceof WC_Order || !hash_equals((string) $order->get_order_key(), $order_key)) {
            BGG_Order_Context_Rate_Limit::mark_invalid('order', $ip);
            self::debug_log('invalid_order_access', ['route' => 'order-context-token', 'ip' => $ip, 'order_id' => $order_id]);
            return new WP_Error('invalid_order_access', 'Invalid order access.', ['status' => 403]);
        }

        if (!self::is_allowed_order_status((string) $order->get_status())) {
            self::debug_log('order_status_not_allowed', ['route' => 'order-context-token', 'status' => (string) $order->get_status(), 'order_id' => (int) $order->get_id()]);
            return new WP_Error('order_status_not_allowed', 'Order status not eligible.', ['status' => 403]);
        }

        $issued = BGG_Order_Context_Token::issue_for_order((int) $order->get_id());

        return rest_ensure_response([
            'token' => $issued['token'],
            'expires_in' => $issued['expires_in'],
            'expires_at' => $issued['expires_at'],
        ]);
    }

    public static function get_order_context(WP_REST_Request $request) {
        if (!class_exists('WooCommerce')) {
            self::debug_log('woocommerce_missing', ['route' => 'order-context']);
            return new WP_Error('woocommerce_missing', 'WooCommerce is required.', ['status' => 500]);
        }

        $origin_error = self::ensure_allowed_origin($request);
        if ($origin_error instanceof WP_Error) {
            return $origin_error;
        }

        $ip = BGG_Order_Context_Rate_Limit::get_client_ip();
        if (!self::allow_request($ip, 'context_read')) {
            self::debug_log('rate_limited', ['route' => 'order-context', 'ip' => $ip]);
            return new WP_Error('rate_limited', 'Too many requests.', ['status' => 429]);
        }

        $token = (string) $request->get_param('token');
        if ($token === '') {
            BGG_Order_Context_Rate_Limit::mark_invalid('token', $ip);
            self::debug_log('missing_token', ['route' => 'order-context', 'ip' => $ip]);
            return new WP_Error('missing_token', 'token is required.', ['status' => 400]);
        }

        $token_payload = BGG_Order_Context_Token::validate($token);
        if (!$token_payload || empty($token_payload['order_id'])) {
            BGG_Order_Context_Rate_Limit::mark_invalid('token', $ip);
            self::debug_log('invalid_token', ['route' => 'order-context', 'ip' => $ip, 'token_hash' => substr(md5($token), 0, 12)]);
            return new WP_Error('invalid_token', 'Invalid or expired token.', ['status' => 403]);
        }

        $order = wc_get_order((int) $token_payload['order_id']);
        if (!$order instanceof WC_Order) {
            BGG_Order_Context_Rate_Limit::mark_invalid('token', $ip);
            self::debug_log('order_not_found', ['route' => 'order-context', 'ip' => $ip, 'order_id' => (int) $token_payload['order_id']]);
            return new WP_Error('order_not_found', 'Order not found.', ['status' => 404]);
        }

        if (!self::is_allowed_order_status((string) $order->get_status())) {
            self::debug_log('order_status_not_allowed', ['route' => 'order-context', 'status' => (string) $order->get_status(), 'order_id' => (int) $order->get_id()]);
            return new WP_Error('order_status_not_allowed', 'Order status not eligible.', ['status' => 403]);
        }

        $config = BGG_Order_Context_Config::load();
        if (!$config) {
            self::debug_log('config_missing', ['route' => 'order-context']);
            return new WP_Error('config_missing', 'Order context configuration is missing or invalid.', ['status' => 500]);
        }

        $product_context = BGG_Order_Context_Resolver::resolve_product_context($order, $config);
        $options_context = BGG_Order_Context_Resolver::resolve_options_context($order, $product_context);
        $ads_duration_weeks = self::resolve_ads_duration_weeks($order, $product_context, $options_context);
        $giveaway_duration_weeks = self::resolve_giveaway_duration_weeks($order, $product_context, $options_context);
        $diagMode = ((string) $request->get_param('diag')) === '1';

        if ($giveaway_duration_weeks !== null) {
            if (!isset($options_context['derived_values']) || !is_array($options_context['derived_values'])) {
                $options_context['derived_values'] = [];
            }
            if (!isset($options_context['derived_values']['giveaway_duration_weeks'])) {
                $options_context['derived_values']['giveaway_duration_weeks'] = $giveaway_duration_weeks;
            }
            if (!isset($options_context['derived_values']['giveaway_duration_days'])) {
                $options_context['derived_values']['giveaway_duration_days'] = $giveaway_duration_weeks * 7;
            }
        }

        $response = [
            'order_number' => (string) $order->get_order_number(),
            'product' => [
                'product_type' => $product_context['product_type'],
                'form_id' => $product_context['form_id'],
                'product_key' => $product_context['product_key'],
                'base_fields' => $product_context['base_fields'],
                'form_fields' => $product_context['form_fields'] ?? [],
                'resolution_status' => $product_context['resolution_status'] ?? null,
            ],
            'order' => [
                'number' => (string) $order->get_order_number(),
                'id' => (int) $order->get_id(),
            ],
            'prefill' => [
                'company_name' => self::resolve_company_prefill($order),
                'contact_email' => (string) $order->get_billing_email(),
            ],
            'reservation' => [
                'ads_duration_weeks' => $ads_duration_weeks,
                'giveaway_duration_weeks' => $giveaway_duration_weeks,
            ],
            'options' => $options_context['options'],
            'enabled_options' => $options_context['enabled_options'],
            'derived_values' => $options_context['derived_values'],
            'activated_blocks' => $options_context['activated_blocks'],
            'config_version' => $config['version'] ?? null,
        ];

        if ($diagMode) {
            $response['resolver_diagnostic'] = BGG_Order_Context_Resolver::get_resolution_debug($order, $product_context);
            $giveaway_options_count = self::get_product_options_count($config, 'publish_giveaway');
            $resolver_file = self::get_class_file_marker('BGG_Order_Context_Resolver');
            $plugin_file = defined('BGG_ORDER_CONTEXT_PLUGIN_FILE') ? (string) BGG_ORDER_CONTEXT_PLUGIN_FILE : '';
            $config_file = defined('BGG_ORDER_CONTEXT_CONFIG_PATH') ? (string) BGG_ORDER_CONTEXT_CONFIG_PATH : '';
            $response['debug'] = [
                'plugin_version' => defined('BGG_ORDER_CONTEXT_VERSION') ? (string) BGG_ORDER_CONTEXT_VERSION : 'unknown',
                'plugin_build_marker' => '2026-03-08-deployment-truth-1',
                'plugin_class_marker' => 'BGG_Order_Context_Plugin',
                'plugin_file_marker' => __FILE__,
                'plugin_main_file' => $plugin_file,
                'resolver_file_marker' => $resolver_file,
                'config_version' => $config['version'] ?? null,
                'config_file_path' => $config_file,
                'config_file_realpath' => $config_file !== '' ? (realpath($config_file) ?: $config_file) : '',
                'config_generated_at' => $config['generated_at'] ?? null,
                'product_key' => (string) ($product_context['product_key'] ?? ''),
                'product_type' => (string) ($product_context['product_type'] ?? ''),
                'order_number' => (string) $order->get_order_number(),
                'raw_enabled_options' => isset($options_context['enabled_options']) && is_array($options_context['enabled_options']) ? array_values($options_context['enabled_options']) : [],
                'derived_values' => isset($options_context['derived_values']) && is_array($options_context['derived_values']) ? $options_context['derived_values'] : [],
                'derived_giveaway_duration_weeks' => $giveaway_duration_weeks,
                'has_additional_images_option' => self::has_option_key($options_context['enabled_options'] ?? [], 'additional_images'),
                'has_extended_text_option' => self::has_option_key($options_context['enabled_options'] ?? [], 'extended_textlimit'),
                'publish_giveaway_config_options_count' => $giveaway_options_count,
            ];
        }

        return rest_ensure_response($response);
    }

    public static function get_allowed_origin(): string {
        return (string) apply_filters('bgg_order_context_allowed_origin', self::ALLOWED_ORIGIN);
    }

    public static function is_allowed_origin(?string $origin): bool {
        if (!is_string($origin) || $origin === '') {
            return true;
        }

        return strtolower($origin) === strtolower(self::get_allowed_origin());
    }

    public static function is_allowed_order_status(string $status): bool {
        $default = ['processing', 'completed'];
        $allowed = apply_filters('bgg_order_context_allowed_statuses', $default);
        if (!is_array($allowed)) {
            $allowed = $default;
        }

        return in_array($status, array_map('strval', $allowed), true);
    }

    private static function ensure_allowed_origin(WP_REST_Request $request): ?WP_Error {
        $origin = $request->get_header('origin');
        if (self::is_allowed_origin($origin)) {
            return null;
        }

        $ip = BGG_Order_Context_Rate_Limit::get_client_ip();
        BGG_Order_Context_Rate_Limit::mark_invalid('origin', $ip);
        self::debug_log('forbidden_origin', ['route' => 'origin-check', 'ip' => $ip, 'origin' => (string) $origin]);

        return new WP_Error('forbidden_origin', 'Origin not allowed.', ['status' => 403]);
    }

    private static function allow_request(string $ip, string $bucket): bool {
        if (BGG_Order_Context_Rate_Limit::is_invalid_blocked($ip)) {
            return false;
        }

        return BGG_Order_Context_Rate_Limit::allow($bucket, 60, 15 * MINUTE_IN_SECONDS, $ip);
    }

    private static function debug_log(string $reason, array $context = []): void {
        $enabled = false;
        if (defined('BGG_ORDER_CONTEXT_DEBUG') && BGG_ORDER_CONTEXT_DEBUG) {
            $enabled = true;
        }
        $enabled = (bool) apply_filters('bgg_order_context_debug_logs', $enabled);
        if (!$enabled) {
            return;
        }

        $safe = [
          'reason' => $reason,
          'context' => $context,
          'ts' => gmdate('c'),
        ];
        error_log('[bgg-order-context] ' . wp_json_encode($safe));
    }

    private static function resolve_ads_duration_weeks(WC_Order $order, array $product_context, array $options_context): ?int {
        if ((string) ($product_context['product_type'] ?? '') !== 'ads') {
            return null;
        }

        if (isset($options_context['derived_values']) && is_array($options_context['derived_values'])) {
            foreach ($options_context['derived_values'] as $key => $value) {
                $key_lc = strtolower((string) $key);
                if (strpos($key_lc, 'duration') === false) {
                    continue;
                }
                if (is_array($value) && isset($value['duration_weeks_final'])) {
                    $weeks = (int) $value['duration_weeks_final'];
                    if ($weeks >= 1 && $weeks <= 52) {
                        return $weeks;
                    }
                }
            }
        }

        foreach ($order->get_items() as $item) {
            if (!$item instanceof WC_Order_Item_Product) {
                continue;
            }

            $qty = (int) $item->get_quantity();
            if ($qty >= 1 && $qty <= 52) {
                $quantity_candidate = $qty;
            } else {
                $quantity_candidate = null;
            }

            $meta_candidates = [
                (string) $item->get_meta('duration_weeks', true),
                (string) $item->get_meta('pa_duration', true),
                (string) $item->get_meta('attribute_pa_duration', true),
                (string) $item->get_meta('duration', true),
                (string) $item->get_meta('attribute_duration', true),
            ];

            foreach ($meta_candidates as $candidate) {
                if ($candidate === '') continue;
                if (preg_match('/(\d+)/', $candidate, $m) === 1) {
                    $weeks = (int) $m[1];
                    if ($weeks >= 1 && $weeks <= 52) {
                        return $weeks;
                    }
                }
            }

            $item_name = (string) $item->get_name();
            if ($item_name !== '' && preg_match('/(\d+)\s*week/i', $item_name, $m) === 1) {
                $weeks = (int) $m[1];
                if ($weeks >= 1 && $weeks <= 52) {
                    return $weeks;
                }
            }

            if ($quantity_candidate !== null) {
                return $quantity_candidate;
            }
        }

        return 1;
    }

    private static function resolve_giveaway_duration_weeks(WC_Order $order, array $product_context, array $options_context): ?int {
        if ((string) ($product_context['product_type'] ?? '') !== 'giveaway') {
            return null;
        }

        if (isset($options_context['derived_values']) && is_array($options_context['derived_values'])) {
            foreach ($options_context['derived_values'] as $key => $value) {
                $key_lc = strtolower((string) $key);
                if (strpos($key_lc, 'duration') === false) {
                    continue;
                }
                if (is_array($value) && isset($value['duration_weeks_purchased'])) {
                    $weeks = (int) $value['duration_weeks_purchased'];
                    if ($weeks >= 1 && $weeks <= 4) {
                        return $weeks;
                    }
                }
                if (is_array($value) && isset($value['duration_weeks_final'])) {
                    $weeks = (int) $value['duration_weeks_final'];
                    if ($weeks >= 1 && $weeks <= 4) {
                        return $weeks;
                    }
                }
                if (is_numeric($value)) {
                    $number = (int) $value;
                    if ($number >= 1 && $number <= 4) return $number;
                    if (in_array($number, [7, 14, 21, 28], true)) return (int) ($number / 7);
                }
                if (is_string($value)) {
                    $weeks = self::extract_weeks_from_string($value);
                    if ($weeks !== null) return $weeks;
                }
            }
        }

        foreach ($order->get_items() as $item) {
            if (!$item instanceof WC_Order_Item_Product) {
                continue;
            }

            $meta_candidates = [
                (string) $item->get_meta('duration_weeks', true),
                (string) $item->get_meta('pa_duration', true),
                (string) $item->get_meta('attribute_pa_duration', true),
                (string) $item->get_meta('duration', true),
                (string) $item->get_meta('attribute_duration', true),
                (string) $item->get_meta('giveaway_duration', true),
                (string) $item->get_meta('giveaway_duration_weeks', true),
                (string) $item->get_name(),
            ];

            foreach ($meta_candidates as $candidate) {
                $weeks = self::extract_weeks_from_string($candidate);
                if ($weeks !== null) {
                    return $weeks;
                }
            }
        }

        return 1;
    }

    private static function extract_weeks_from_string(string $raw): ?int {
        $raw = trim($raw);
        if ($raw === '') return null;

        if (preg_match('/\b(1|2|3|4)\s*week/i', $raw, $m) === 1) {
            return (int) $m[1];
        }
        if (preg_match('/\b(7|14|21|28)\s*day/i', $raw, $m) === 1) {
            return (int) ((int) $m[1] / 7);
        }
        if (preg_match('/\b(1|2|3|4)\b/', $raw, $m) === 1) {
            return (int) $m[1];
        }

        return null;
    }

    private static function normalize_option_key(string $value): string {
        return preg_replace('/[^a-z0-9]+/', '', strtolower(trim($value)));
    }

    private static function has_option_key(array $enabled_options, string $expected): bool {
        $target = self::normalize_option_key($expected);
        foreach ($enabled_options as $option) {
            if (!is_string($option)) continue;
            $normalized = self::normalize_option_key($option);
            if ($normalized === $target || strpos($normalized, $target) !== false) {
                return true;
            }
        }
        return false;
    }

    private static function get_product_options_count(array $config, string $product_key): int {
        if (!isset($config['products']) || !is_array($config['products'])) {
            return 0;
        }
        foreach ($config['products'] as $product) {
            if (!is_array($product)) continue;
            if ((string) ($product['product_key'] ?? '') !== $product_key) continue;
            $options = isset($product['options']) && is_array($product['options']) ? $product['options'] : [];
            return count($options);
        }
        return 0;
    }

    private static function get_class_file_marker(string $class_name): string {
        if (!class_exists($class_name)) {
            return '';
        }
        try {
            $reflection = new ReflectionClass($class_name);
            $file = $reflection->getFileName();
            return is_string($file) ? $file : '';
        } catch (Throwable $e) {
            return '';
        }
    }

    private static function resolve_company_prefill(WC_Order $order): string {
        $billing_company = trim((string) $order->get_billing_company());
        if ($billing_company !== '') {
            return $billing_company;
        }

        $customer_id = (int) $order->get_customer_id();
        if ($customer_id > 0) {
            $meta_company = trim((string) get_user_meta($customer_id, 'billing_company', true));
            if ($meta_company !== '') {
                return $meta_company;
            }
        }

        return '';
    }
}
