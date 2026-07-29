import { createHmac, timingSafeEqual } from "node:crypto";

const QR_PREFIX = "mealpoint:v1";

function getSigningSecret() {
  const secret = process.env.QR_SIGNING_SECRET || process.env.MANAGER_PASSWORD;
  if (!secret) {
    throw new Error("QR_SIGNING_SECRET is not configured");
  }
  return secret;
}

function createSignature(subscriptionId: string, subscriptionCode: string) {
  return createHmac("sha256", getSigningSecret())
    .update(`${subscriptionId}|${subscriptionCode}`)
    .digest("base64url");
}

export function buildSubscriptionQrPayload(subscriptionId: string, subscriptionCode: string) {
  const signature = createSignature(subscriptionId, subscriptionCode);
  return `${QR_PREFIX}:${subscriptionId}:${signature}`;
}

export function parseSubscriptionQrPayload(payload: string) {
  const trimmed = payload.trim();
  const match = trimmed.match(/^mealpoint:v1:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):([A-Za-z0-9_-]{43})$/i);
  if (!match) return null;

  return {
    subscriptionId: match[1],
    signature: match[2]
  };
}

export function verifySubscriptionQrSignature(subscriptionId: string, subscriptionCode: string, signature: string) {
  const expected = createSignature(subscriptionId, subscriptionCode);
  const suppliedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (suppliedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(suppliedBuffer, expectedBuffer);
}
