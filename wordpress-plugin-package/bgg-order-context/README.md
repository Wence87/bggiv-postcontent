# BGG Order Context API Plugin (Hardened)

Standalone WordPress plugin for submit app integration.

## Endpoints

1. Issue short-lived token (requires `order_id` + `order_key` validation):
- `POST /wp-json/bgg/v1/order-context-token`
- Body/query params: `order_id`, `order_key`

2. Fetch form context (token only):
- `GET /wp-json/bgg/v1/order-context?token=...`
- Temporary resolver diagnostic mode:
  - `GET /wp-json/bgg/v1/order-context?token=...&diag=1`

## Security behavior

- Token TTL is short-lived (default 20 minutes; clamped to 10..30 minutes).
- No direct `order_id + order_key` access on context endpoint.
- CORS restricted to `https://submit.boardgamegiveaways.com`.
- IP-based throttling enabled.
- Invalid token/order/origin attempts are tracked and throttled.
- Order access restricted to allowed Woo statuses (default: `processing`, `completed`).
- Optional temporary debug logs via `BGG_ORDER_CONTEXT_DEBUG` in `wp-config.php`.

## Runtime config

Config file used at runtime:
- `wp-content/plugins/bgg-order-context/config/order-context.config.json`

## Regenerate config from CSV

Use the generator script in source/development context:

```bash
node wp-content/plugins/bgg-order-context/scripts/generate-order-context-config.mjs \
  "/absolute/path/Feuille 1-Produits.csv" \
  "/absolute/path/Feuille 1-Options.csv" \
  "wp-content/plugins/bgg-order-context/config/order-context.config.json"
```

Product SKU overrides are maintained in:
- `wp-content/plugins/bgg-order-context/scripts/product-mapping.overrides.json`

## Build production zip (runtime files only)

From repository root:

```bash
cd wordpress-plugin-package
zip -r bgg-order-context-production.zip bgg-order-context \
  -x "bgg-order-context/scripts/*" \
  -x "bgg-order-context/scripts/**"
```

Then install in WordPress admin:
1. `Plugins` -> `Add New Plugin` -> `Upload Plugin`
2. Upload `bgg-order-context-production.zip`
3. Activate **BGG Order Context API**

## Optional filters

- `bgg_order_context_allowed_origin`
- `bgg_order_context_allowed_statuses`
- `bgg_order_context_token_ttl`
