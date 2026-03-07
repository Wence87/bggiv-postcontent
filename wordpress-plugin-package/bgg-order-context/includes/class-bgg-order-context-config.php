<?php

if (!defined('ABSPATH')) {
    exit;
}

final class BGG_Order_Context_Config {
    private static ?array $cached = null;

    public static function load(): ?array {
        if (self::$cached !== null) {
            return self::$cached;
        }

        if (!file_exists(BGG_ORDER_CONTEXT_CONFIG_PATH) || !is_readable(BGG_ORDER_CONTEXT_CONFIG_PATH)) {
            return null;
        }

        $raw = file_get_contents(BGG_ORDER_CONTEXT_CONFIG_PATH);
        if (!is_string($raw) || $raw === '') {
            return null;
        }

        $decoded = json_decode($raw, true);
        if (!is_array($decoded) || !isset($decoded['products']) || !is_array($decoded['products'])) {
            return null;
        }

        self::$cached = $decoded;
        return self::$cached;
    }
}
