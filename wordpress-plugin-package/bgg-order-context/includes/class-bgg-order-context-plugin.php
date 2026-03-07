<?php

if (!defined('ABSPATH')) {
    exit;
}

final class BGG_Order_Context_Plugin {
    public static function init(): void {
        add_action('rest_api_init', [BGG_Order_Context_REST::class, 'register_routes']);
        add_filter('rest_pre_dispatch', [self::class, 'block_disallowed_origin'], 10, 3);
        add_filter('rest_pre_serve_request', [self::class, 'serve_cors_headers'], 10, 4);
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
}
