# BoardGameGiveaways Availability Management

Next.js (App Router) + TypeScript project with Tailwind CSS, shadcn/ui base setup, and Prisma + PostgreSQL.

## Routes

- `/calendar`: public read-only placeholder UI
- `/public-calendar`: public read-only calendar
- `/admin/<ADMIN_SLUG_SECRET>`: admin UI (secret route, cookie bootstrap required)
- `/submit?token=...`: WooCommerce submission flow
- `GET /api/public/availability`: public availability API
- `POST /api/admin/bookings`: admin create booking API
- `DELETE /api/admin/bookings/:id`: admin delete booking API
- `GET /api/submit/bootstrap?token=...`: token verify + draft bootstrap
- `POST /api/submit/reserve`: reserve slot as draft (12h expiry)
- `POST /api/submit/finalize`: submit title/body and finalize booking
- `POST /api/internal/cleanup-expired`: expire stale reservations

## Environment setup

1. Copy env file:

```bash
cp .env.example .env
```

2. Set values in `.env`:
- `DATABASE_URL`: PostgreSQL connection string
- `ADMIN_TOKEN`: shared admin API token used via `x-admin-token` header
- `ADMIN_SLUG_SECRET`: secret path segment for admin URL
- `ADMIN_BOOTSTRAP_KEY`: bootstrap key to set admin session cookie
- `BGGIV_TOKEN_SECRET`: shared HMAC secret with Woo plugin
- `ENABLE_RESERVATION_CLEANUP_INTERVAL`: set to `1` to run in-process cleanup every 15 min
- `CLEANUP_CRON_SECRET`: secret for external cleanup endpoint calls

Admin access (local): `http://localhost:3000/admin/<ADMIN_SLUG_SECRET>?key=<ADMIN_BOOTSTRAP_KEY>`
Then reopen `http://localhost:3000/admin/<ADMIN_SLUG_SECRET>`.

Submit flow + Woo integration details:
- See `docs/submit-integration-audit.md`
- WordPress mini-plugin: `../wordpress-plugin-package/bggiv-woo-submit-link.php`

## Woo order-context config + endpoint

The Woo plugin now supports a normalized order-context API based on generated config:

- Config source artifact: `../wordpress-plugin-package/config/order-context.config.json`
- Generator script: `scripts/generate-order-context-config.mjs`
- REST endpoint: `POST /wp-json/bgg/v1/order-context-token` then `GET /wp-json/bgg/v1/order-context?token=...`

Regenerate config from CSV:

```bash
node scripts/generate-order-context-config.mjs \
  "/Users/didierdmacbook16/Desktop/BGGIV-DataPourChatGPTCodex/Feuille 1-Produits.csv" \
  "/Users/didierdmacbook16/Desktop/BGGIV-DataPourChatGPTCodex/Feuille 1-Options.csv" \
  "../wordpress-plugin-package/config/order-context.config.json"
```

## Run locally

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Then open `http://localhost:3000`.

## Prisma commands

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio
```

Equivalent direct Prisma CLI commands:

```bash
npx prisma generate
npx prisma migrate dev
npx prisma studio
```

## API examples

Public availability:

```bash
curl "http://localhost:3000/api/public/availability?product=sponsorship"
curl "http://localhost:3000/api/public/availability?product=ads&from=2026-01-01T00:00:00.000Z&to=2026-06-30T23:59:59.999Z"
curl "http://localhost:3000/api/public/availability?product=news&tz=Europe/Brussels"
```

Admin create booking:

```bash
curl -X POST "http://localhost:3000/api/admin/bookings" \
  -H "Content-Type: application/json" \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -d '{
    "product": "SPONSORSHIP",
    "monthKey": "2026-05",
    "companyName": "Acme Games",
    "customerEmail": "ops@acmegames.com",
    "orderRef": "ORD-1001",
    "internalNote": "Priority partner"
  }'
```

Admin delete booking:

```bash
curl -X DELETE "http://localhost:3000/api/admin/bookings/<BOOKING_ID>" \
  -H "x-admin-token: $ADMIN_TOKEN"
```

## Useful commands

```bash
npm run build
npm run start
npm run lint
```
