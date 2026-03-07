import { cleanupExpiredReservations } from "@/lib/submissionService";

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

declare global {
  // eslint-disable-next-line no-var
  var __bggivCleanupSchedulerStarted: boolean | undefined;
}

export function startCleanupScheduler() {
  if (typeof window !== "undefined") return;
  if (process.env.ENABLE_RESERVATION_CLEANUP_INTERVAL !== "1") return;
  if (global.__bggivCleanupSchedulerStarted) return;

  global.__bggivCleanupSchedulerStarted = true;
  void cleanupExpiredReservations();

  const timer = setInterval(() => {
    void cleanupExpiredReservations();
  }, CLEANUP_INTERVAL_MS);

  if (typeof timer.unref === "function") {
    timer.unref();
  }
}
