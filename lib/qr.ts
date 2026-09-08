import { createHmac, timingSafeEqual } from "node:crypto";

const PICKUP_QR_PREFIX = "mealpoint:pickup:v1";
function getPickupQrSecret() {
  const secret = (process.env.PICKUP_QR_SECRET || "").trim();
  if (!secret || secret.length < 24) throw new Error("PICKUP_QR_SECRET is not configured or is too short");
  return secret;
}
function signatureForPoint(pointCode: string) {
  return createHmac("sha256", getPickupQrSecret()).update(`${PICKUP_QR_PREFIX}|${pointCode}`).digest("base64url");
}
export function buildPickupPointQrPayload(pointCode: string) {
  const normalized = pointCode.trim().toLowerCase();
  return `${PICKUP_QR_PREFIX}:${normalized}:${signatureForPoint(normalized)}`;
}
export function parsePickupPointQrPayload(payload: string) {
  const match = payload.trim().match(/^mealpoint:pickup:v1:([a-z0-9-]{2,40}):([A-Za-z0-9_-]{43})$/);
  return match ? { pointCode: match[1], signature: match[2] } : null;
}
export function verifyPickupPointQrSignature(pointCode: string, signature: string) {
  const expected = signatureForPoint(pointCode);
  const supplied = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return supplied.length === expectedBuffer.length && timingSafeEqual(supplied, expectedBuffer);
}
