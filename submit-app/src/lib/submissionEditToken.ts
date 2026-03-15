import crypto from "crypto";

type SubmissionEditTokenPayload = {
  kind: "submission_edit";
  submission_id: string;
  email: string;
  iat: number;
};

const TOKEN_PREFIX = "bgg_edit";

function toBase64Url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + "=".repeat(padLength), "base64").toString("utf8");
}

function getSecret(): string {
  const secret = process.env.SUBMIT_EDIT_TOKEN_SECRET || process.env.BGGIV_TOKEN_SECRET;
  if (!secret) {
    throw new Error("TOKEN_SECRET_NOT_CONFIGURED");
  }
  return secret;
}

function isValidPayload(value: unknown): value is SubmissionEditTokenPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    payload.kind === "submission_edit" &&
    typeof payload.submission_id === "string" &&
    typeof payload.email === "string" &&
    typeof payload.iat === "number"
  );
}

export function createSubmissionEditToken(input: { submissionId: string; email: string; ttlSeconds?: number }): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SubmissionEditTokenPayload = {
    kind: "submission_edit",
    submission_id: input.submissionId,
    email: input.email.trim().toLowerCase(),
    iat: now,
  };
  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", getSecret()).update(payloadB64).digest("hex");
  return `${TOKEN_PREFIX}.${payloadB64}.${signature}`;
}

export function isSubmissionEditToken(token: string): boolean {
  return token.startsWith(`${TOKEN_PREFIX}.`);
}

export function verifySubmissionEditToken(token: string): SubmissionEditTokenPayload {
  const [prefix, payloadB64, signature, ...extra] = token.split(".");
  if (prefix !== TOKEN_PREFIX || !payloadB64 || !signature || extra.length > 0) {
    throw new Error("TOKEN_MALFORMED");
  }

  const expected = crypto.createHmac("sha256", getSecret()).update(payloadB64).digest("hex");
  if (expected.length !== signature.length || !crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"))) {
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
