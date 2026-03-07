# Calendar App Audit + Woo Submit Integration

## 1) Existing system audit (before extension)

### Stack
- Next.js 15 App Router + React 19 + TypeScript.
- Prisma + PostgreSQL.
- Tailwind + shadcn/ui.
- Main files:
  - `src/app/*` routes
  - `src/app/api/*` APIs
  - `src/lib/bookingService.ts` booking + capacity logic
  - `prisma/schema.prisma` data model

### Existing public and admin routes
- Public calendar pages:
  - `src/app/public-calendar/page.tsx`
  - `src/app/calendar/page.tsx`
- Public availability APIs:
  - `src/app/api/public/availability/sponsorship/route.ts`
  - `src/app/api/public/availability/ads/route.ts`
  - `src/app/api/public/availability/posts/route.ts`
  - `src/app/api/public/availability/route.ts`
- Admin backend:
  - UI: `src/app/admin/[slug]/page.tsx`, `src/app/admin/AdminPageClient.tsx`
  - APIs: `src/app/api/admin/bookings/route.ts`, `src/app/api/admin/bookings/[id]/route.ts`
  - Admin availability: `src/app/api/admin/posts/availability/route.ts`
  - Secret middleware gate: `src/middleware.ts`

### Existing models and capacity handling (pre-extension)
- `Booking` model in `prisma/schema.prisma` already existed.
- Capacity + lock logic lived in `src/lib/bookingService.ts` and public/admin availability APIs:
  - Sponsorship: `1/month` using `monthKey` uniqueness + checks.
  - Ads: `10/week` via grouped count + serializable transaction checks.
  - Posts (news/promo/giveaway):
    - `72h` lock window (`LOCK_DAYS = 3`) in Brussels timezone.
    - News: one per hour globally across post products.
    - Promo/Giveaway: one post-day capacity behavior as currently implemented by existing calendar logic.
- Timezone reference:
  - `Europe/Brussels` is already the business reference timezone.
  - Utilities in `src/lib/timezone.ts` and `src/lib/bookingService.ts`.

### Existing admin backend
- Token-protected (`ADMIN_TOKEN`) API access for create/list/delete bookings.
- Secret slug + bootstrap key middleware for admin page access.
- Admin UI supports:
  - Sponsorship month range bookings
  - Ads week bookings
  - Posts day/hour bookings
  - Deleting grouped bookings

## 2) What was added (minimal extension)

### New submit flow
- Page:
  - `src/app/submit/page.tsx`
  - `src/components/submit/SubmitPageClient.tsx`
- APIs:
  - `GET /api/submit/bootstrap` (`src/app/api/submit/bootstrap/route.ts`)
  - `POST /api/submit/reserve` (`src/app/api/submit/reserve/route.ts`)
  - `POST /api/submit/finalize` (`src/app/api/submit/finalize/route.ts`)
- Token verification:
  - `src/lib/submitToken.ts`
  - Verifies `payload.signature` with `HMAC-SHA256(payload_b64, BGGIV_TOKEN_SECRET)`.
  - Rejects invalid/expired tokens.

### Reservation + expiration
- Booking lifecycle statuses added:
  - `DRAFT_RESERVED`, `SUBMITTED`, `CANCELLED`, `PUBLISHED`
- Draft reservation behavior:
  - Reserve immediately as `DRAFT_RESERVED`
  - `expiresAt = now + 12h`
  - Final submission switches booking to `SUBMITTED`
  - Expired reservations become `CANCELLED`
- Service:
  - `src/lib/submissionService.ts`

### Cleanup job
- Cleanup API endpoint:
  - `POST /api/internal/cleanup-expired` (`src/app/api/internal/cleanup-expired/route.ts`)
- In-process scheduler (every 15 minutes):
  - `src/lib/cleanupScheduler.ts`
  - Started from `src/app/layout.tsx` when `ENABLE_RESERVATION_CLEANUP_INTERVAL=1`
- Opportunistic cleanup also runs during submit bootstrap.

### Data model extension
- Prisma schema:
  - `BookingStatus` enum
  - `SubmissionDraftStatus` enum
  - `Booking` new fields: `status`, `reservedByOrderId`, `expiresAt`
  - New `SubmissionDraft` model
- Files:
  - `prisma/schema.prisma`
  - `prisma/migrations/20260303150000_add_submission_drafts_and_booking_status/migration.sql`

### Availability/capacity consistency changes
- Availability and capacity queries now consider only active blocking bookings:
  - `SUBMITTED`, `PUBLISHED`, or non-expired `DRAFT_RESERVED`
- Implemented through:
  - `getActiveBookingWhere()` in `src/lib/bookingService.ts`
  - applied in public/admin availability + booking capacity checks.

## 3) WordPress mini-plugin

- File: `../wordpress-plugin-package/bggiv-woo-submit-link.php`
- Features:
  - Generates signed token on order `processing`.
  - Caches submit link in order meta.
  - Thank you page:
    - “Continue to submission” button
    - auto-redirect after 4 seconds
  - Order emails:
    - “Complete your submission: <link>”
  - My Account > Orders action:
    - “Complete submission”

## 4) Required env/config

Calendar app env:
- `DATABASE_URL`
- `ADMIN_TOKEN`
- `ADMIN_SLUG_SECRET`
- `ADMIN_BOOTSTRAP_KEY`
- `BGGIV_TOKEN_SECRET` (must match WP `BGGIV_TOKEN_SECRET`)
- `ENABLE_RESERVATION_CLEANUP_INTERVAL=1` (enable in-process 15-min scheduler)
- `CLEANUP_CRON_SECRET` (required if calling `/api/internal/cleanup-expired` externally)

WordPress:
- Set `BGGIV_TOKEN_SECRET` in `wp-config.php` to same value as calendar app env.

## 5) Deploy/DB steps

1. Run Prisma migration:
```bash
npm run prisma:migrate
```
2. Regenerate Prisma client:
```bash
npm run prisma:generate
```
3. Build and run:
```bash
npm run build
npm run start
```

## 6) Operational note

For strong production guarantees on every 15-minute cleanup, call:
- `POST /api/internal/cleanup-expired` with header `x-cleanup-secret: <CLEANUP_CRON_SECRET>`
from your platform scheduler every 15 minutes.
