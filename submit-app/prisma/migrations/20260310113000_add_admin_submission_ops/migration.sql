-- Create enums for admin permissions and submission workflow statuses
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'CONTENT_ADMIN', 'OPS_ADMIN', 'PUBLISHER', 'CLIENT_PRO');
CREATE TYPE "OrderPaymentStatus" AS ENUM ('PAID', 'PENDING', 'FAILED', 'REFUNDED');
CREATE TYPE "EditorialStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED');
CREATE TYPE "PublicationStatus" AS ENUM ('NOT_SCHEDULED', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- Extend submission persistence with order linkage and context snapshot
ALTER TABLE "SubmitFormSubmission"
  ADD COLUMN "linkedOrderId" TEXT,
  ADD COLUMN "orderNumber" TEXT,
  ADD COLUMN "orderContextJson" JSONB;

CREATE INDEX "SubmitFormSubmission_linkedOrderId_idx" ON "SubmitFormSubmission"("linkedOrderId");
CREATE INDEX "SubmitFormSubmission_orderNumber_idx" ON "SubmitFormSubmission"("orderNumber");
CREATE INDEX "SubmitFormSubmission_contactEmail_idx" ON "SubmitFormSubmission"("contactEmail");
CREATE INDEX "SubmitFormSubmission_companyName_idx" ON "SubmitFormSubmission"("companyName");

-- One operational state row per submission
CREATE TABLE "SubmissionOps" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "orderPaymentStatus" "OrderPaymentStatus" NOT NULL DEFAULT 'PAID',
  "editorialStatus" "EditorialStatus" NOT NULL DEFAULT 'SUBMITTED',
  "publicationStatus" "PublicationStatus" NOT NULL DEFAULT 'NOT_SCHEDULED',
  "reviewerAssignee" TEXT,
  "clientVisibleNote" TEXT,
  "internalNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SubmissionOps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubmissionOps_submissionId_key" ON "SubmissionOps"("submissionId");
CREATE INDEX "SubmissionOps_editorialStatus_idx" ON "SubmissionOps"("editorialStatus");
CREATE INDEX "SubmissionOps_publicationStatus_idx" ON "SubmissionOps"("publicationStatus");
CREATE INDEX "SubmissionOps_orderPaymentStatus_idx" ON "SubmissionOps"("orderPaymentStatus");
CREATE INDEX "SubmissionOps_reviewerAssignee_idx" ON "SubmissionOps"("reviewerAssignee");
CREATE INDEX "SubmissionOps_updatedAt_idx" ON "SubmissionOps"("updatedAt");

ALTER TABLE "SubmissionOps"
  ADD CONSTRAINT "SubmissionOps_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "SubmitFormSubmission"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Audit trail events for workflow changes
CREATE TABLE "SubmissionAuditEvent" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "actorRole" "AdminRole" NOT NULL,
  "actorIdentifier" TEXT,
  "eventType" TEXT NOT NULL,
  "fieldName" TEXT,
  "fromValue" TEXT,
  "toValue" TEXT,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SubmissionAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubmissionAuditEvent_submissionId_createdAt_idx" ON "SubmissionAuditEvent"("submissionId", "createdAt");

ALTER TABLE "SubmissionAuditEvent"
  ADD CONSTRAINT "SubmissionAuditEvent_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "SubmitFormSubmission"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill operational rows for existing submissions
INSERT INTO "SubmissionOps" (
  "id",
  "submissionId",
  "orderPaymentStatus",
  "editorialStatus",
  "publicationStatus",
  "createdAt",
  "updatedAt"
)
SELECT
  CONCAT('ops_', "id"),
  "id",
  'PAID'::"OrderPaymentStatus",
  'SUBMITTED'::"EditorialStatus",
  'NOT_SCHEDULED'::"PublicationStatus",
  NOW(),
  NOW()
FROM "SubmitFormSubmission"
ON CONFLICT ("submissionId") DO NOTHING;
