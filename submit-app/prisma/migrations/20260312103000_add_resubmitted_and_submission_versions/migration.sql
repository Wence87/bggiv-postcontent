-- Add RESUBMITTED editorial status
ALTER TYPE "EditorialStatus" ADD VALUE IF NOT EXISTS 'RESUBMITTED';

-- Store previous snapshots for correction diff
CREATE TABLE IF NOT EXISTS "SubmissionVersion" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "productKey" TEXT NOT NULL,
  "productType" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "contactEmail" TEXT NOT NULL,
  "notes" TEXT,
  "reservationMonthKey" TEXT,
  "reservationWeekKey" TEXT,
  "reservationStartsAt" TIMESTAMP(3),
  "formDataJson" JSONB NOT NULL,
  "orderContextJson" JSONB,
  "bannerImageName" TEXT NOT NULL,
  "additionalImage1Name" TEXT,
  "additionalImage2Name" TEXT,
  "additionalImage3Name" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubmissionVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SubmissionVersion_submissionId_createdAt_idx"
  ON "SubmissionVersion"("submissionId", "createdAt");

ALTER TABLE "SubmissionVersion"
  ADD CONSTRAINT "SubmissionVersion_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "SubmitFormSubmission"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
