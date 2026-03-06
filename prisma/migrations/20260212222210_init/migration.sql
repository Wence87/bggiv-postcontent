-- CreateEnum
CREATE TYPE "Product" AS ENUM ('SPONSORSHIP', 'ADS', 'NEWS', 'PROMO', 'GIVEAWAY');

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "product" "Product" NOT NULL,
    "startsAtUtc" TIMESTAMP(3),
    "endsAtUtc" TIMESTAMP(3),
    "monthKey" TEXT,
    "weekKey" TEXT,
    "companyName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "orderRef" TEXT NOT NULL,
    "internalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Booking_weekKey_idx" ON "Booking"("weekKey");

-- CreateIndex
CREATE INDEX "Booking_startsAtUtc_idx" ON "Booking"("startsAtUtc");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_monthKey_key" ON "Booking"("monthKey");
