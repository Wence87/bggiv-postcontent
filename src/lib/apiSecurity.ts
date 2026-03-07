const ipBuckets = new Map<string, number[]>();

function nowMs(): number {
  return Date.now();
}

function cleanOld(values: number[], windowMs: number, current: number): number[] {
  return values.filter((timestamp) => current - timestamp < windowMs);
}

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export function allowRateLimited(key: string, limit: number, windowMs: number): boolean {
  const current = nowMs();
  const currentValues = cleanOld(ipBuckets.get(key) ?? [], windowMs, current);
  if (currentValues.length >= limit) {
    ipBuckets.set(key, currentValues);
    return false;
  }
  currentValues.push(current);
  ipBuckets.set(key, currentValues);
  return true;
}

export function isAllowedOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (!origin) return true;

  const allowedOrigin = (process.env.SUBMIT_APP_ORIGIN || "https://submit.boardgamegiveaways.com").toLowerCase();
  return origin.toLowerCase() === allowedOrigin;
}
