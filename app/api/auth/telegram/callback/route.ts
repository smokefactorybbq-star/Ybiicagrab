import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createBrowserSession, getAuthenticatedAccount, getOrCreateTelegramAccount, setSessionCookie } from "../../../../../lib/auth";
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
    const userId = await getOrCreateTelegramAccount(telegram);
    const token = await createBrowserSession(userId);
    const response = redirect("ok");
    response.cookies.delete("mealpoint_login_state");
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    const code = error instanceof Error ? error.message : "TELEGRAM_LOGIN_FAILED";
    console.error("Telegram login callback failed", error);
    return redirect(["TELEGRAM_NOT_CONFIGURED","TELEGRAM_AUTH_EXPIRED","BAD_TELEGRAM_AUTH"].includes(code)?code:"TELEGRAM_LOGIN_FAILED");
  }
}
