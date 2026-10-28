import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, hashSessionToken, SESSION_COOKIE } from "../../../../lib/auth";
import { query } from "../../../../lib/db";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value || "";
  if (token) await query(`DELETE FROM customer_sessions WHERE token_hash = $1`, [hashSessionToken(token)]);
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
