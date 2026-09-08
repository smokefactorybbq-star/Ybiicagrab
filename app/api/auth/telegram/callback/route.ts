import { NextRequest, NextResponse } from "next/server";
import {
  clearTelegramLoginStateCookie,
  createBrowserSession,
  setSessionCookie,
  upsertTelegramIdentity,
  validateTelegramLoginPayload,
  verifyTelegramLoginState
} from "../../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicOrigin(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (!host) throw new Error("Public host is missing");
  return `${proto}://${host}`;
}

function redirectError(request: NextRequest) {
  const response = NextResponse.redirect(
    new URL("/shop.html?telegram_login=error", publicOrigin(request))
  );
  clearTelegramLoginStateCookie(response);
  return response;
}

export async function GET(request: NextRequest) {
  try {
    const state = request.nextUrl.searchParams.get("state") || "";
    if (!verifyTelegramLoginState(request, state)) throw new Error("Invalid Telegram login state");
    const identity = validateTelegramLoginPayload(request.nextUrl.searchParams);
    const user = await upsertTelegramIdentity(identity);
    const token = await createBrowserSession(user.id);
    const requestedDestination = request.nextUrl.searchParams.get("return_to") || "";
    const destination = requestedDestination.startsWith("/") && !requestedDestination.startsWith("//")
      ? requestedDestination
      : "/shop.html?telegram_login=ok";
    const response = NextResponse.redirect(new URL(destination, publicOrigin(request)));
    clearTelegramLoginStateCookie(response);
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    console.error("Telegram browser login failed", error);
    return redirectError(request);
  }
}
