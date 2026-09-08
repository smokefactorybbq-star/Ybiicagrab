import { NextRequest, NextResponse } from "next/server";
import { createTelegramLoginState, setTelegramLoginStateCookie } from "../../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeReturnTo(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/shop.html?account=1";
}

function publicOrigin(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (!host) throw new Error("Public host is missing");
  return `${proto}://${host}`;
}

export async function GET(request: NextRequest) {
  const state = createTelegramLoginState();
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("return_to") || "/shop.html?account=1");
  const callback = new URL("/api/auth/telegram/callback", publicOrigin(request));
  callback.searchParams.set("state", state);
  callback.searchParams.set("return_to", returnTo);
  const response = NextResponse.json({ ok: true, authUrl: callback.toString() }, { headers: { "Cache-Control": "no-store" } });
  setTelegramLoginStateCookie(response, state);
  return response;
}
