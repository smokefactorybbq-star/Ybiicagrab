import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  clearRememberedSessionCookie,
  createBrowserSession,
  getOrCreateTelegramAccount,
  normalizeContactPhone,
  setSessionCookie
} from "../../../../../lib/auth";
import { query } from "../../../../../lib/db";
import {
  canonicalPhoneDigits,
  getMealPointPublicOrigin,
  getTelegramOidcConfig,
  TELEGRAM_OIDC_NONCE_COOKIE,
  TELEGRAM_OIDC_PHONE_COOKIE,
  TELEGRAM_OIDC_STATE_COOKIE,
  TELEGRAM_OIDC_VERIFIER_COOKIE,
  verifyTelegramOidcIdToken
} from "../../../../../lib/telegram-oidc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameValue(left: string, right: string) {
  const a = Buffer.from(left || "");
  const b = Buffer.from(right || "");
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

function clearOidcCookies(response: NextResponse) {
  for (const name of [TELEGRAM_OIDC_STATE_COOKIE, TELEGRAM_OIDC_VERIFIER_COOKIE, TELEGRAM_OIDC_NONCE_COOKIE, TELEGRAM_OIDC_PHONE_COOKIE]) {
    response.cookies.set(name, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  }
}

export async function GET(request: NextRequest) {
  const origin = getMealPointPublicOrigin();
  const redirect = (status: string) => NextResponse.redirect(`${origin}/account?telegram=${encodeURIComponent(status)}`, 303);

  try {
    const errorParam = request.nextUrl.searchParams.get("error");
    if (errorParam) throw new Error("TELEGRAM_LOGIN_CANCELLED");

    const suppliedState = request.nextUrl.searchParams.get("state") || "";
    const expectedState = request.cookies.get(TELEGRAM_OIDC_STATE_COOKIE)?.value || "";
    const verifier = request.cookies.get(TELEGRAM_OIDC_VERIFIER_COOKIE)?.value || "";
    const nonce = request.cookies.get(TELEGRAM_OIDC_NONCE_COOKIE)?.value || "";
    const enteredPhone = request.cookies.get(TELEGRAM_OIDC_PHONE_COOKIE)?.value || "";
    const code = request.nextUrl.searchParams.get("code") || "";
    if (!sameValue(suppliedState, expectedState) || !verifier || !nonce || !enteredPhone || !code) throw new Error("BAD_TELEGRAM_AUTH");

    const { clientId, clientSecret } = getTelegramOidcConfig();
    const redirectUri = `${origin}/api/auth/telegram/oidc-callback`;
    const tokenResponse = await fetch("https://oauth.telegram.org/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: verifier
      }),
      cache: "no-store"
    });
    const tokenData = await tokenResponse.json().catch(() => ({})) as { id_token?: string; error?: string; error_description?: string };
    if (!tokenResponse.ok || !tokenData.id_token) {
      console.error("Telegram OIDC token exchange failed", tokenResponse.status, tokenData.error, tokenData.error_description);
      throw new Error("BAD_TELEGRAM_AUTH");
    }

    const claims = await verifyTelegramOidcIdToken(tokenData.id_token, clientId, nonce);
    const claimedPhoneDigits = canonicalPhoneDigits(claims.phone_number || "");
    const enteredPhoneDigits = canonicalPhoneDigits(enteredPhone);
    if (!claimedPhoneDigits || claims.phone_number_verified === false) throw new Error("TELEGRAM_PHONE_REQUIRED");
    if (!enteredPhoneDigits || claimedPhoneDigits !== enteredPhoneDigits) throw new Error("TELEGRAM_PHONE_MISMATCH");

    const telegramId = String(claims.id || claims.sub);
    const displayName = String(claims.name || "").trim();
    const nameParts = displayName.split(/\s+/).filter(Boolean);
    const userId = await getOrCreateTelegramAccount({
      id: telegramId,
      first_name: String(claims.given_name || nameParts[0] || ""),
      last_name: String(claims.family_name || nameParts.slice(1).join(" ") || ""),
      username: String(claims.preferred_username || ""),
      photo_url: String(claims.picture || ""),
      auth_date: String(claims.iat),
      hash: "oidc"
    });

    const verifiedPhone = normalizeContactPhone(`+${claimedPhoneDigits}`);
    if (!verifiedPhone) throw new Error("TELEGRAM_PHONE_REQUIRED");
    // The Telegram number is used to verify this login. Do not overwrite an
    // existing delivery/contact number if the customer changed it in profile.
    await query(
      `UPDATE users SET phone = CASE WHEN phone IS NULL OR trim(phone) = '' THEN $1 ELSE phone END,
                        updated_at = now(), last_site_visit_at = now()
       WHERE id = $2`,
      [verifiedPhone, userId]
    );
    await query(
      `INSERT INTO customer_accounts (user_id, phone, password_hash) VALUES ($1, $2, '')
       ON CONFLICT (user_id) DO UPDATE
       SET phone = CASE WHEN customer_accounts.phone IS NULL OR trim(customer_accounts.phone) = '' THEN EXCLUDED.phone ELSE customer_accounts.phone END,
           updated_at = now()`,
      [userId, verifiedPhone]
    );

    const sessionToken = await createBrowserSession(userId);
    const response = redirect("ok");
    clearOidcCookies(response);
    clearRememberedSessionCookie(response);
    setSessionCookie(response, sessionToken);
    return response;
  } catch (error) {
    const code = error instanceof Error ? error.message : "TELEGRAM_LOGIN_FAILED";
    console.error("Telegram OIDC callback failed", error);
    const publicCode = [
      "TELEGRAM_OIDC_NOT_CONFIGURED",
      "TELEGRAM_AUTH_EXPIRED",
      "BAD_TELEGRAM_AUTH",
      "TELEGRAM_PHONE_REQUIRED",
      "TELEGRAM_PHONE_MISMATCH",
      "TELEGRAM_LOGIN_CANCELLED"
    ].includes(code) ? code : "TELEGRAM_LOGIN_FAILED";
    const response = redirect(publicCode);
    clearOidcCookies(response);
    return response;
  }
}
