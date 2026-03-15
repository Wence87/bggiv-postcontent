import crypto from "crypto";

export type SubmitTokenProductType = "sponsorship" | "ads" | "news" | "promo" | "giveaway";

export type SubmitTokenPayload = {
  order_id: string;
  order_key: string;
  email: string;
  product_type: SubmitTokenProductType;
  duration_weeks: number | null;
  iat: number;
};

function fromBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);
  return Buffer.from(padded, "base64").toString("utf8");
}

function timingSafeEqualHex(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function isValidPayload(payload: unknown): payload is SubmitTokenPayload {
  if (!payload || typeof payload !== "object") return false;
  const value = payload as Record<string, unknown>;
  const product = value.product_type;
  const duration = value.duration_weeks;
  const validProduct =
    product === "sponsorship" ||
    product === "ads" ||
    product === "news" ||
    product === "promo" ||
    product === "giveaway";
  const validDuration =
    duration === null || (Number.isInteger(duration) && Number(duration) >= 1 && Number(duration) <= 4);

  return (
    typeof value.order_id === "string" &&
    typeof value.order_key === "string" &&
    typeof value.email === "string" &&
    validProduct &&
    validDuration &&
    typeof value.iat === "number"
  );
}

export function verifySubmitToken(token: string): SubmitTokenPayload {
  const secret = process.env.BGGIV_TOKEN_SECRET;
  if (!secret) {
    throw new Error("TOKEN_SECRET_NOT_CONFIGURED");
  }

  const [payloadB64, signatureHex, ...extra] = token.split(".");
  if (!payloadB64 || !signatureHex || extra.length > 0) {
    throw new Error("TOKEN_MALFORMED");
  }

  const expectedSignature = crypto.createHmac("sha256", secret).update(payloadB64).digest("hex");
  if (!timingSafeEqualHex(expectedSignature, signatureHex)) {
    throw new Error("TOKEN_INVALID_SIGNATURE");
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(fromBase64Url(payloadB64));
  } catch {
    throw new Error("TOKEN_INVALID_PAYLOAD");
  }

  if (!isValidPayload(decoded)) {
    throw new Error("TOKEN_INVALID_PAYLOAD");
  }

  return decoded;
}
