-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "groupId" TEXT;

-- CreateIndex
CREATE INDEX "Booking_groupId_idx" ON "Booking"("groupId");
