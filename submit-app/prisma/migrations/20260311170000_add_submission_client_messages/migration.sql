-- CreateTable
CREATE TABLE "SubmissionClientMessage" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "actorRole" "AdminRole" NOT NULL,
    "actorIdentifier" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionClientMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubmissionClientMessage_submissionId_createdAt_idx" ON "SubmissionClientMessage"("submissionId", "createdAt");

-- AddForeignKey
ALTER TABLE "SubmissionClientMessage" ADD CONSTRAINT "SubmissionClientMessage_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "SubmitFormSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
