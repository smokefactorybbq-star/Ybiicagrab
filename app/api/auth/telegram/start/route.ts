import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { normalizeContactPhone } from "../../../../../lib/auth";
import {
  getMealPointPublicOrigin,
  getTelegramOidcConfig,
  TELEGRAM_OIDC_NONCE_COOKIE,
  TELEGRAM_OIDC_PHONE_COOKIE,
  TELEGRAM_OIDC_STATE_COOKIE,
  TELEGRAM_OIDC_VERIFIER_COOKIE
} from "../../../../../lib/telegram-oidc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function setTransientCookie(response: NextResponse, name: string, value: string) {
  response.cookies.set(name, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawPhone = String(body.phone || "").trim();
    const compactPhone = rawPhone.replace(/[\s().-]/g, "");
    if (!(compactPhone.startsWith("+") || compactPhone.startsWith("00"))) {
      return NextResponse.json({ ok: false, error: "Введите номер в международном формате, например +66 81 234 5678" }, { status: 400 });
    }
    const phone = normalizeContactPhone(rawPhone);
    if (!phone) return NextResponse.json({ ok: false, error: "Введите корректный номер телефона" }, { status: 400 });

    let clientId = "";
    try {
      ({ clientId } = getTelegramOidcConfig());
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "TELEGRAM_OIDC_NOT_CONFIGURED") {
        // Backward-compatible fallback: the existing Telegram Login Widget only
        // needs TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_USERNAME and a BotFather domain.
        return NextResponse.json(
          { ok: true, mode: "legacy" },
          { headers: { "Cache-Control": "no-store" } }
        );
      }
      throw error;
    }
    const origin = getMealPointPublicOrigin();
    const redirectUri = `${origin}/api/auth/telegram/oidc-callback`;
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const nonce = randomBytes(32).toString("base64url");

    const authorizationUrl = new URL("https://oauth.telegram.org/auth");
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("scope", "openid profile phone telegram:bot_access");
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("nonce", nonce);
    authorizationUrl.searchParams.set("code_challenge", challenge);
    authorizationUrl.searchParams.set("code_challenge_method", "S256");
    // Do not silently reuse the previous Telegram Web authorization.
    authorizationUrl.searchParams.set("prompt", "login");
    authorizationUrl.searchParams.set("max_age", "0");

    const response = NextResponse.json({ ok: true, authorizationUrl: authorizationUrl.toString() }, { headers: { "Cache-Control": "no-store" } });
    setTransientCookie(response, TELEGRAM_OIDC_STATE_COOKIE, state);
    setTransientCookie(response, TELEGRAM_OIDC_VERIFIER_COOKIE, verifier);
    setTransientCookie(response, TELEGRAM_OIDC_NONCE_COOKIE, nonce);
    setTransientCookie(response, TELEGRAM_OIDC_PHONE_COOKIE, phone);
    return response;
  } catch (error) {
    const code = error instanceof Error ? error.message : "TELEGRAM_OIDC_START_FAILED";
    const message = code === "TELEGRAM_OIDC_NOT_CONFIGURED"
      ? "Telegram Web Login не настроен: добавьте TELEGRAM_CLIENT_ID и TELEGRAM_CLIENT_SECRET в Railway"
      : "Не удалось начать вход через Telegram";
    console.error("Telegram OIDC start failed", error);
    return NextResponse.json({ ok: false, error: message, code }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
