-- Collaborator management for reviewer assignment and scoped visibility
CREATE TABLE "Collaborator" (
  "id" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "AdminRole" NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "apiTokenHash" TEXT,
  "companyScope" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Collaborator_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Collaborator_email_key" ON "Collaborator"("email");
CREATE UNIQUE INDEX "Collaborator_apiTokenHash_key" ON "Collaborator"("apiTokenHash");

ALTER TABLE "SubmissionOps"
  ADD COLUMN "reviewerCollaboratorId" TEXT;

CREATE INDEX "SubmissionOps_reviewerCollaboratorId_idx" ON "SubmissionOps"("reviewerCollaboratorId");

ALTER TABLE "SubmissionOps"
  ADD CONSTRAINT "SubmissionOps_reviewerCollaboratorId_fkey"
  FOREIGN KEY ("reviewerCollaboratorId") REFERENCES "Collaborator"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
