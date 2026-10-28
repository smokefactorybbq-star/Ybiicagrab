import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createBrowserSession, getOrCreateTelegramAccount, normalizeContactPhone, setSessionCookie } from "../../../../../lib/auth";
import { query } from "../../../../../lib/db";
import { parseAndVerifyTelegramLogin } from "../../../../../lib/telegram-login";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getPublicOrigin(request: NextRequest) {
  // Railway/Next can expose request.url as http://localhost:<port>/... inside the
  // container. Never use that internal URL as the browser redirect target.
  const configured = (process.env.MEALPOINT_PUBLIC_URL || process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (configured) {
    try {
      const url = new URL(configured.includes("://") ? configured : `https://${configured}`);
      if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return url.origin;
    } catch {
      // Fall through to the proxy headers below.
    }
  }

  const forwardedHost = (request.headers.get("x-forwarded-host") || "").split(",")[0].trim();
  const host = forwardedHost || (request.headers.get("host") || "").split(",")[0].trim();
  const forwardedProto = (request.headers.get("x-forwarded-proto") || "").split(",")[0].trim();
  const protocol = forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : "https";

  if (host && !/^localhost(?::\d+)?$/i.test(host) && !/^127\.0\.0\.1(?::\d+)?$/i.test(host)) {
    return `${protocol}://${host}`;
  }

  // Production safety net. This is deliberately public and can never point a
  // customer's browser to Railway's internal localhost.
  return "https://www.meal-point.com";
}

export async function GET(request: NextRequest) {
  const publicOrigin = getPublicOrigin(request);
  const redirect = (status: string) =>
    NextResponse.redirect(`${publicOrigin}/account?telegram=${encodeURIComponent(status)}`, 303);

  try {
    const supplied=Buffer.from(request.nextUrl.searchParams.get("state")||"");
    const expected=Buffer.from(request.cookies.get("mealpoint_login_state")?.value||"");
    if(expected.length!==43||supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw new Error("BAD_TELEGRAM_AUTH");
    const telegram = parseAndVerifyTelegramLogin(new URL(request.url));
    const pendingPhone = normalizeContactPhone(request.cookies.get("mealpoint_pending_login_phone")?.value || "");
    let preferredUserId: string | null = null;
    if (pendingPhone) {
      const existingPhoneAccount = await query<{ id: string; telegramId: string | null }>(
        `SELECT u.id::text AS id, u.telegram_id::text AS "telegramId"
         FROM users u
         LEFT JOIN customer_accounts ca ON ca.user_id = u.id
         WHERE ca.phone = $1 OR u.phone = $1
         ORDER BY u.created_at ASC
         LIMIT 1`,
        [pendingPhone]
      );
      if (existingPhoneAccount.rows[0] && !existingPhoneAccount.rows[0].telegramId) {
        preferredUserId = existingPhoneAccount.rows[0].id;
      }
    }
    const userId = await getOrCreateTelegramAccount(telegram, preferredUserId);
    if (pendingPhone) {
      await query(
        `UPDATE users SET phone = CASE WHEN phone IS NULL OR trim(phone) = '' THEN $1 ELSE phone END,
                          updated_at = now(), last_site_visit_at = now()
         WHERE id = $2`,
        [pendingPhone, userId]
      );
      await query(
        `INSERT INTO customer_accounts (user_id, phone, password_hash) VALUES ($1, $2, '')
         ON CONFLICT (user_id) DO UPDATE
         SET phone = CASE WHEN customer_accounts.phone IS NULL OR trim(customer_accounts.phone) = '' THEN EXCLUDED.phone ELSE customer_accounts.phone END,
             updated_at = now()`,
        [userId, pendingPhone]
      );
    }
    const token = await createBrowserSession(userId);
    const response = redirect("ok");
    response.cookies.delete("mealpoint_login_state");
    response.cookies.delete("mealpoint_pending_login_phone");
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    const code = error instanceof Error ? error.message : "TELEGRAM_LOGIN_FAILED";
    console.error("Telegram login callback failed", error);
    const response = redirect(["TELEGRAM_NOT_CONFIGURED","TELEGRAM_AUTH_EXPIRED","BAD_TELEGRAM_AUTH"].includes(code)?code:"TELEGRAM_LOGIN_FAILED");
    response.cookies.delete("mealpoint_login_state");
    response.cookies.delete("mealpoint_pending_login_phone");
    return response;
  }
}
