-- CreateEnum
CREATE TYPE "ReservationSource" AS ENUM ('DRAFT_HOLD', 'WOOCOMMERCE_PAID_ORDER', 'TEST_DATA', 'ADMIN_MANUAL', 'LEGACY');

-- AlterTable
ALTER TABLE "Booking"
  ADD COLUMN "reservationSource" "ReservationSource" NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "reservationLocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "linkedOrderId" TEXT;

-- Backfill: protect any reservation already linked to a WooCommerce order
UPDATE "Booking"
SET "reservationSource" = 'WOOCOMMERCE_PAID_ORDER',
    "reservationLocked" = true
WHERE "linkedOrderId" IS NOT NULL
  AND BTRIM("linkedOrderId") <> '';

-- Indexes
CREATE INDEX "Booking_reservationLocked_reservationSource_idx" ON "Booking"("reservationLocked", "reservationSource");
CREATE INDEX "Booking_linkedOrderId_idx" ON "Booking"("linkedOrderId");
