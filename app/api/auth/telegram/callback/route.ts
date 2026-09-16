import { NextRequest, NextResponse } from "next/server";
import { createBrowserSession, getAuthenticatedAccount, getOrCreateTelegramAccount, setSessionCookie } from "../../../../../lib/auth";
import { parseAndVerifyTelegramLogin } from "../../../../../lib/telegram-login";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const redirect = (status: string) => NextResponse.redirect(new URL(`/account?telegram=${encodeURIComponent(status)}`, request.url));
  try {
    const telegram = parseAndVerifyTelegramLogin(new URL(request.url));
    const current = await getAuthenticatedAccount(request);
    const userId = await getOrCreateTelegramAccount(telegram, current?.userId || null);
    const token = await createBrowserSession(userId);
    const response = redirect("ok");
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    const code = error instanceof Error ? error.message : "TELEGRAM_LOGIN_FAILED";
    console.error("Telegram login callback failed", error);
    return redirect(code);
  }
}
