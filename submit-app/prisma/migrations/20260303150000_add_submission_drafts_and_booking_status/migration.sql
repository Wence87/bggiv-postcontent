-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('DRAFT_RESERVED', 'SUBMITTED', 'CANCELLED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "SubmissionDraftStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Booking"
  ADD COLUMN "status" "BookingStatus" NOT NULL DEFAULT 'SUBMITTED',
  ADD COLUMN "reservedByOrderId" TEXT,
  ADD COLUMN "expiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SubmissionDraft" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderKey" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "product" "Product" NOT NULL,
  "durationWeeks" INTEGER,
  "status" "SubmissionDraftStatus" NOT NULL DEFAULT 'DRAFT',
  "title" TEXT,
  "body" TEXT,
  "bookingId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SubmissionDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionDraft_orderId_key" ON "SubmissionDraft"("orderId");

-- CreateIndex
CREATE INDEX "Booking_status_expiresAt_idx" ON "Booking"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Booking_reservedByOrderId_idx" ON "Booking"("reservedByOrderId");

-- CreateIndex
CREATE INDEX "SubmissionDraft_status_idx" ON "SubmissionDraft"("status");

-- CreateIndex
CREATE INDEX "SubmissionDraft_product_idx" ON "SubmissionDraft"("product");

-- AddForeignKey
ALTER TABLE "SubmissionDraft"
  ADD CONSTRAINT "SubmissionDraft_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
