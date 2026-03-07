<?php

if (!defined('ABSPATH')) {
    exit;
}

final class BGG_Order_Context_Token {
    private const TRANSIENT_PREFIX = 'bgg_oc_tok_';

    public static function get_ttl_seconds(): int {
        $ttl = (int) apply_filters('bgg_order_context_token_ttl', 20 * MINUTE_IN_SECONDS);
        return max(10 * MINUTE_IN_SECONDS, min(30 * MINUTE_IN_SECONDS, $ttl));
    }

    public static function issue_for_order(int $order_id): array {
        $ttl = self::get_ttl_seconds();
        $token = self::generate_token();
        $expires_at = time() + $ttl;

        $payload = [
            'order_id' => $order_id,
            'exp' => $expires_at,
        ];

        set_transient(self::transient_key($token), $payload, $ttl);

        return [
            'token' => $token,
            'expires_in' => $ttl,
            'expires_at' => gmdate('c', $expires_at),
        ];
    }

    public static function validate(string $token): ?array {
        if (!preg_match('/^[A-Za-z0-9\-_]{32,128}$/', $token)) {
            return null;
        }

        $payload = get_transient(self::transient_key($token));
        if (!is_array($payload)) {
            return null;
        }

        $order_id = isset($payload['order_id']) ? (int) $payload['order_id'] : 0;
        $exp = isset($payload['exp']) ? (int) $payload['exp'] : 0;

        if ($order_id <= 0 || $exp <= time()) {
            delete_transient(self::transient_key($token));
            return null;
        }

        return [
            'order_id' => $order_id,
            'exp' => $exp,
        ];
    }

    private static function generate_token(): string {
        $bytes = random_bytes(32);
        $token = rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
        return $token;
    }

    private static function transient_key(string $token): string {
        return self::TRANSIENT_PREFIX . md5($token);
    }
}
