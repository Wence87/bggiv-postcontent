<?php

if (!defined('ABSPATH')) {
    exit;
}

final class BGG_Order_Context_Rate_Limit {
    private const PREFIX = 'bgg_oc_rl_';
    private const INVALID_PREFIX = 'bgg_oc_rl_invalid_';

    public static function get_client_ip(): string {
        $forwarded = isset($_SERVER['HTTP_X_FORWARDED_FOR']) ? (string) $_SERVER['HTTP_X_FORWARDED_FOR'] : '';
        if ($forwarded !== '') {
            $parts = explode(',', $forwarded);
            $ip = trim((string) ($parts[0] ?? ''));
            if ($ip !== '') {
                return $ip;
            }
        }

        $remote = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
        return $remote !== '' ? $remote : 'unknown';
    }

    public static function allow(string $bucket, int $limit, int $window_seconds, string $ip): bool {
        $key = self::PREFIX . md5($bucket . '|' . $ip);
        $count = (int) get_transient($key);
        if ($count >= $limit) {
            return false;
        }

        set_transient($key, $count + 1, $window_seconds);
        return true;
    }

    public static function mark_invalid(string $type, string $ip): void {
        $key = self::INVALID_PREFIX . md5($type . '|' . $ip);
        $count = (int) get_transient($key);
        set_transient($key, $count + 1, 15 * MINUTE_IN_SECONDS);
    }

    public static function is_invalid_blocked(string $ip): bool {
        $types = ['token', 'order', 'origin'];
        $total = 0;
        foreach ($types as $type) {
            $key = self::INVALID_PREFIX . md5($type . '|' . $ip);
            $total += (int) get_transient($key);
        }

        return $total >= 20;
    }
}
