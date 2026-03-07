ALTER TABLE "SubmitFormSubmission"
  ADD COLUMN "reservationMonthKey" TEXT,
  ADD COLUMN "reservationWeekKey" TEXT,
  ADD COLUMN "reservationStartsAt" TIMESTAMP(3);
