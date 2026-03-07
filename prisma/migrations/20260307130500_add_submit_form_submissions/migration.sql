-- Create table for finalized submit form payloads (token-based flow)
CREATE TABLE "SubmitFormSubmission" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "productKey" TEXT NOT NULL,
  "productType" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "contactEmail" TEXT NOT NULL,
  "websiteUrl" TEXT NOT NULL,
  "targetUrl" TEXT NOT NULL,
  "adFormat" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "bannerImageName" TEXT NOT NULL,
  "bannerImageMimeType" TEXT NOT NULL,
  "bannerImageSize" INTEGER NOT NULL,
  "bannerImageData" BYTEA NOT NULL,
  "formDataJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SubmitFormSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubmitFormSubmission_tokenHash_key" ON "SubmitFormSubmission"("tokenHash");
CREATE INDEX "SubmitFormSubmission_productKey_idx" ON "SubmitFormSubmission"("productKey");
CREATE INDEX "SubmitFormSubmission_productType_idx" ON "SubmitFormSubmission"("productType");
CREATE INDEX "SubmitFormSubmission_createdAt_idx" ON "SubmitFormSubmission"("createdAt");
