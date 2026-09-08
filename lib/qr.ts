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


// Compatibility exports for old files that can remain in a Git repository
// after a ZIP is copied over it. The active pickup flow uses the functions above.
const SUBSCRIPTION_QR_PREFIX = "mealpoint:subscription:v1";
function getSubscriptionQrSecret() {
  return (process.env.SUBSCRIPTION_QR_SECRET || process.env.PICKUP_QR_SECRET || "").trim();
}
export function buildSubscriptionQrPayload(...parts: any[]) {
  const body = parts.map((part) => String(part)).join(":");
  const secret = getSubscriptionQrSecret();
  if (!secret || secret.length < 24) throw new Error("SUBSCRIPTION_QR_SECRET/PICKUP_QR_SECRET is not configured or is too short");
  const signature = createHmac("sha256", secret).update(`${SUBSCRIPTION_QR_PREFIX}|${body}`).digest("base64url");
  return `${SUBSCRIPTION_QR_PREFIX}:${body}:${signature}`;
}
export function parseSubscriptionQrPayload(payload: string): any {
  const value = payload.trim();
  if (!value.startsWith(`${SUBSCRIPTION_QR_PREFIX}:`)) return null;
  const parts = value.split(":");
  if (parts.length < 6) return null;
  const signature = parts.pop() || "";
  const values = parts.slice(3);
  return {
    subscriptionId: values[0] || "",
    userId: values[1] || "",
    issuedAt: values[2] || "",
    signature,
    body: values.join(":")
  };
}
export function verifySubscriptionQrSignature(...args: any[]) {
  if (args.length < 2) return false;
  const suppliedSignature = String(args[args.length - 1]);
  const bodyParts = args.slice(0, -1).map((part) => String(part));
  const secret = getSubscriptionQrSecret();
  if (!secret || secret.length < 24) return false;
  const body = bodyParts.join(":");
  const expected = createHmac("sha256", secret).update(`${SUBSCRIPTION_QR_PREFIX}|${body}`).digest("base64url");
  const supplied = Buffer.from(suppliedSignature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return supplied.length === expectedBuffer.length && timingSafeEqual(supplied, expectedBuffer);
}
