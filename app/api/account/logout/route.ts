import { NextRequest, NextResponse } from "next/server";
import {
  clearSessionCookie,
  REMEMBERED_SESSION_COOKIE,
  SESSION_COOKIE,
  setRememberedSessionCookie
} from "../../../../lib/auth";

export const runtime = "nodejs";

// Soft logout: leave the cabinet, but keep a secure remembered session so the
// same customer can return with one tap. "Close session" is handled separately.
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value || request.cookies.get(REMEMBERED_SESSION_COOKIE)?.value || "";
  const response = NextResponse.json({ ok: true, remembered: Boolean(token) });
  if (token) setRememberedSessionCookie(response, token);
  clearSessionCookie(response);
  return response;
}
