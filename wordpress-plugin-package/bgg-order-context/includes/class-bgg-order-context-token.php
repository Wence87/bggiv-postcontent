<?php

if (!defined('ABSPATH')) {
    exit;
}

final class BGG_Order_Context_Token {
    private const TRANSIENT_PREFIX = 'bgg_oc_tok_';

    public static function issue_for_order(int $order_id): array {
        $token = self::generate_token();

        $payload = [
            'order_id' => $order_id,
        ];

        set_transient(self::transient_key($token), $payload, 0);

        return [
            'token' => $token,
            'expires_in' => null,
            'expires_at' => null,
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

        if ($order_id <= 0) {
            delete_transient(self::transient_key($token));
            return null;
        }

        return [
            'order_id' => $order_id,
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
