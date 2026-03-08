<?php

if (!defined('ABSPATH')) {
    exit;
}

final class BGG_Order_Context_Plugin {
    private const DEFAULT_SUBMIT_BASE_URL = 'https://submit.boardgamegiveaways.com/submit';

    public static function init(): void {
        add_action('rest_api_init', [BGG_Order_Context_REST::class, 'register_routes']);
        add_filter('rest_pre_dispatch', [self::class, 'block_disallowed_origin'], 10, 3);
        add_filter('rest_pre_serve_request', [self::class, 'serve_cors_headers'], 10, 4);
        add_action('woocommerce_thankyou', [self::class, 'render_thank_you_submit_redirect'], 20, 1);
        add_action('woocommerce_email_after_order_table', [self::class, 'render_email_submit_link'], 20, 4);
        add_filter('woocommerce_my_account_my_orders_actions', [self::class, 'add_my_account_submit_action'], 20, 2);
    }

    public static function block_disallowed_origin($result, WP_REST_Server $server, WP_REST_Request $request) {
        $route = $request->get_route();
        if (strpos($route, '/bgg/v1/') !== 0) {
            return $result;
        }

        $origin = $request->get_header('origin');
        if (BGG_Order_Context_REST::is_allowed_origin($origin)) {
            return $result;
        }

        $ip = BGG_Order_Context_Rate_Limit::get_client_ip();
        BGG_Order_Context_Rate_Limit::mark_invalid('origin', $ip);

        return new WP_Error('forbidden_origin', 'Origin not allowed.', ['status' => 403]);
    }

    public static function serve_cors_headers(bool $served, $result, WP_REST_Request $request, WP_REST_Server $server): bool {
        $route = $request->get_route();
        if (strpos($route, '/bgg/v1/') !== 0) {
            return $served;
        }

        $origin = $request->get_header('origin');
        if (!BGG_Order_Context_REST::is_allowed_origin($origin)) {
            return $served;
        }

        if ($origin) {
            header('Access-Control-Allow-Origin: ' . esc_url_raw(BGG_Order_Context_REST::get_allowed_origin()));
            header('Vary: Origin');
            header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
            header('Access-Control-Allow-Headers: Content-Type');
            header('Access-Control-Max-Age: 600');
        }

        if ($request->get_method() === 'OPTIONS') {
            status_header(200);
            return true;
        }

        return $served;
    }

    public static function render_thank_you_submit_redirect(int $order_id): void {
        if (!class_exists('WooCommerce')) {
            return;
        }

        $order = wc_get_order($order_id);
        if (!$order instanceof WC_Order) {
            return;
        }
        if (!BGG_Order_Context_REST::is_allowed_order_status((string) $order->get_status())) {
            return;
        }
        if (!self::is_submit_enabled_order($order)) {
            return;
        }

        $submit_url = self::issue_submit_url($order);
        if ($submit_url === null) {
            return;
        }

        echo '<p style="margin-top:16px">';
        echo '<a class="button alt" style="font-size:16px;padding:12px 18px" href="' . esc_url($submit_url) . '">';
        echo esc_html__('Continue to your submission form', 'bgg-order-context');
        echo '</a>';
        echo '</p>';
        echo '<script>setTimeout(function(){window.location.href=' . wp_json_encode($submit_url) . ';}, 1500);</script>';
    }

    public static function render_email_submit_link(WC_Order $order, bool $sent_to_admin, bool $plain_text, WC_Email $email): void {
        if ($sent_to_admin) {
            return;
        }
        if (!BGG_Order_Context_REST::is_allowed_order_status((string) $order->get_status())) {
            return;
        }
        if (!self::is_submit_enabled_order($order)) {
            return;
        }

        $submit_url = self::issue_submit_url($order);
        if ($submit_url === null) {
            return;
        }

        if ($plain_text) {
            echo "\nComplete your submission: " . esc_url_raw($submit_url) . "\n";
            return;
        }

        echo '<p>Complete your submission: <a href="' . esc_url($submit_url) . '">' . esc_html($submit_url) . '</a></p>';
    }

    public static function add_my_account_submit_action(array $actions, WC_Order $order): array {
        if (!BGG_Order_Context_REST::is_allowed_order_status((string) $order->get_status())) {
            return $actions;
        }
        if (!self::is_submit_enabled_order($order)) {
            return $actions;
        }

        $submit_url = self::issue_submit_url($order);
        if ($submit_url === null) {
            return $actions;
        }

        $actions['bgg_continue_submission'] = [
            'url' => $submit_url,
            'name' => __('Complete submission', 'bgg-order-context'),
        ];

        return $actions;
    }

    private static function issue_submit_url(WC_Order $order): ?string {
        $issued = BGG_Order_Context_Token::issue_for_order((int) $order->get_id());
        $token = (string) ($issued['token'] ?? '');
        if ($token === '') {
            return null;
        }

        $base_url = (string) apply_filters('bgg_order_context_submit_base_url', self::DEFAULT_SUBMIT_BASE_URL);
        $base_url = rtrim($base_url, '/');
        if ($base_url === '') {
            return null;
        }

        return $base_url . '?token=' . rawurlencode($token);
    }

    private static function is_submit_enabled_order(WC_Order $order): bool {
        $config = BGG_Order_Context_Config::load();
        if (!$config) {
            return false;
        }

        $product_context = BGG_Order_Context_Resolver::resolve_product_context($order, $config);
        $product_key = (string) ($product_context['product_key'] ?? '');
        $product_type = (string) ($product_context['product_type'] ?? '');

        return $product_key !== '' && $product_type !== '' && $product_type !== 'unknown';
    }
}
