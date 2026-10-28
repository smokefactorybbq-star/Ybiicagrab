import { createPublicKey, verify } from "node:crypto";

export const TELEGRAM_OIDC_STATE_COOKIE = "mealpoint_tg_oidc_state";
export const TELEGRAM_OIDC_VERIFIER_COOKIE = "mealpoint_tg_oidc_verifier";
export const TELEGRAM_OIDC_NONCE_COOKIE = "mealpoint_tg_oidc_nonce";
export const TELEGRAM_OIDC_PHONE_COOKIE = "mealpoint_tg_oidc_phone";

export type TelegramOidcClaims = {
  iss: string;
  aud: string | string[];
  sub: string;
  iat: number;
  exp: number;
  nonce?: string;
  id?: number | string;
  name?: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  picture?: string;
  phone_number?: string;
  phone_number_verified?: boolean;
};

export function getMealPointPublicOrigin() {
  const raw = (process.env.MEALPOINT_PUBLIC_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://www.meal-point.com").trim();
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return "https://www.meal-point.com";
    return url.origin;
  } catch {
    return "https://www.meal-point.com";
  }
}

export function getTelegramOidcConfig() {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const tokenBotId = /^([0-9]+):/.exec(token)?.[1] || "";
  const clientId = (process.env.TELEGRAM_CLIENT_ID || tokenBotId).trim();
  const clientSecret = (process.env.TELEGRAM_CLIENT_SECRET || "").trim();
  if (!clientId || !/^\d+$/.test(clientId) || !clientSecret) throw new Error("TELEGRAM_OIDC_NOT_CONFIGURED");
  return { clientId, clientSecret };
}

export function canonicalPhoneDigits(value: string) {
  return String(value || "").replace(/\D/g, "");
}

function parseJwtPart<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

export async function verifyTelegramOidcIdToken(idToken: string, clientId: string, expectedNonce: string) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new Error("BAD_TELEGRAM_OIDC_TOKEN");

  const header = parseJwtPart<{ alg?: string; kid?: string }>(parts[0]);
  const claims = parseJwtPart<TelegramOidcClaims>(parts[1]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("UNSUPPORTED_TELEGRAM_OIDC_ALG");

  const jwksResponse = await fetch("https://oauth.telegram.org/.well-known/jwks.json", { cache: "no-store" });
  if (!jwksResponse.ok) throw new Error("TELEGRAM_JWKS_UNAVAILABLE");
  const jwks = await jwksResponse.json() as { keys?: Array<Record<string, unknown> & { kid?: string; alg?: string }> };
  const jwk = (jwks.keys || []).find(key => key.kid === header.kid && (!key.alg || key.alg === header.alg));
  if (!jwk) throw new Error("TELEGRAM_JWK_NOT_FOUND");

  const publicKey = createPublicKey({ key: jwk as any, format: "jwk" });
  const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`);
  const signature = Buffer.from(parts[2], "base64url");
  if (!verify("RSA-SHA256", signingInput, publicKey, signature)) throw new Error("BAD_TELEGRAM_OIDC_SIGNATURE");

  const now = Math.floor(Date.now() / 1000);
  const audienceOk = Array.isArray(claims.aud) ? claims.aud.includes(clientId) : String(claims.aud || "") === clientId;
  if (claims.iss !== "https://oauth.telegram.org" || !audienceOk) throw new Error("BAD_TELEGRAM_OIDC_CLAIMS");
  if (!Number.isFinite(claims.exp) || claims.exp < now - 30 || !Number.isFinite(claims.iat) || claims.iat > now + 60) throw new Error("TELEGRAM_AUTH_EXPIRED");
  if (!expectedNonce || claims.nonce !== expectedNonce) throw new Error("BAD_TELEGRAM_OIDC_NONCE");
  if (!/^\d+$/.test(String(claims.id || claims.sub || ""))) throw new Error("BAD_TELEGRAM_OIDC_CLAIMS");
  return claims;
}
