import { NextRequest, NextResponse } from "next/server";
import {
  clearRememberedSessionCookie,
  clearSessionCookie,
  hashSessionToken,
  REMEMBERED_SESSION_COOKIE,
  SESSION_COOKIE
} from "../../../../lib/auth";
import { query } from "../../../../lib/db";
import {
  TELEGRAM_OIDC_NONCE_COOKIE,
  TELEGRAM_OIDC_PHONE_COOKIE,
  TELEGRAM_OIDC_STATE_COOKIE,
  TELEGRAM_OIDC_VERIFIER_COOKIE
} from "../../../../lib/telegram-oidc";

export const runtime = "nodejs";

// Hard logout. There is intentionally no "remember previous user" session.
// The next login starts from a blank phone field and a new Telegram authorization.
export async function POST(request: NextRequest) {
  const tokens = [
    request.cookies.get(SESSION_COOKIE)?.value || "",
    request.cookies.get(REMEMBERED_SESSION_COOKIE)?.value || ""
  ].filter(Boolean);
  const hashes = [...new Set(tokens.map(hashSessionToken))];
  for (const tokenHash of hashes) await query(`DELETE FROM customer_sessions WHERE token_hash = $1`, [tokenHash]);

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  clearRememberedSessionCookie(response);
  for (const name of [TELEGRAM_OIDC_STATE_COOKIE, TELEGRAM_OIDC_VERIFIER_COOKIE, TELEGRAM_OIDC_NONCE_COOKIE, TELEGRAM_OIDC_PHONE_COOKIE]) {
    response.cookies.set(name, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  }
  return response;
}
