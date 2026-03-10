ALTER TABLE "SubmitFormSubmission"
  ADD COLUMN "additionalImage1Name" TEXT,
  ADD COLUMN "additionalImage1MimeType" TEXT,
  ADD COLUMN "additionalImage1Size" INTEGER,
  ADD COLUMN "additionalImage1Data" BYTEA,
  ADD COLUMN "additionalImage2Name" TEXT,
  ADD COLUMN "additionalImage2MimeType" TEXT,
  ADD COLUMN "additionalImage2Size" INTEGER,
  ADD COLUMN "additionalImage2Data" BYTEA,
  ADD COLUMN "additionalImage3Name" TEXT,
  ADD COLUMN "additionalImage3MimeType" TEXT,
  ADD COLUMN "additionalImage3Size" INTEGER,
  ADD COLUMN "additionalImage3Data" BYTEA;
