<?php
/**
 * Plugin Name: BGG Order Context API
 * Description: Provides order-context data for the submit app via WooCommerce order validation and config-driven mapping.
 * Version: 1.1.0
 * Author: BoardGameGiveaways
 */

if (!defined('ABSPATH')) {
    exit;
}

define('BGG_ORDER_CONTEXT_PLUGIN_FILE', __FILE__);
define('BGG_ORDER_CONTEXT_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('BGG_ORDER_CONTEXT_CONFIG_PATH', BGG_ORDER_CONTEXT_PLUGIN_DIR . 'config/order-context.config.json');
define('BGG_ORDER_CONTEXT_VERSION', '1.1.0');

require_once BGG_ORDER_CONTEXT_PLUGIN_DIR . 'includes/class-bgg-order-context-config.php';
require_once BGG_ORDER_CONTEXT_PLUGIN_DIR . 'includes/class-bgg-order-context-token.php';
require_once BGG_ORDER_CONTEXT_PLUGIN_DIR . 'includes/class-bgg-order-context-rate-limit.php';
require_once BGG_ORDER_CONTEXT_PLUGIN_DIR . 'includes/class-bgg-order-context-resolver.php';
require_once BGG_ORDER_CONTEXT_PLUGIN_DIR . 'includes/class-bgg-order-context-rest.php';
require_once BGG_ORDER_CONTEXT_PLUGIN_DIR . 'includes/class-bgg-order-context-plugin.php';

BGG_Order_Context_Plugin::init();
