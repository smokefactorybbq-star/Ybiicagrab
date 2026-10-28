import { NextRequest, NextResponse } from "next/server";
import {
  clearRememberedSessionCookie,
  clearSessionCookie,
  getRememberedAccount,
  hashSessionToken,
  REMEMBERED_SESSION_COOKIE,
  SESSION_COOKIE,
  setSessionCookie
} from "../../../../lib/auth";
import { query } from "../../../../lib/db";

export const runtime = "nodejs";

function publicRememberedAccount(account: Awaited<ReturnType<typeof getRememberedAccount>>) {
  if (!account) return null;
  return {
    fullName: account.fullName,
    telegramUsername: account.telegramUsername,
    photoUrl: account.photoUrl
  };
}

export async function GET(request: NextRequest) {
  const account = await getRememberedAccount(request);
  const response = NextResponse.json({ ok: true, remembered: publicRememberedAccount(account) });
  if (!account) clearRememberedSessionCookie(response);
  return response;
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(REMEMBERED_SESSION_COOKIE)?.value || "";
  const account = await getRememberedAccount(request);
  if (!token || !account) {
    const response = NextResponse.json({ ok: false, error: "Сохранённая сессия больше недоступна" }, { status: 401 });
    clearRememberedSessionCookie(response);
    clearSessionCookie(response);
    return response;
  }
  const response = NextResponse.json({ ok: true, account });
  setSessionCookie(response, token);
  return response;
}

export async function DELETE(request: NextRequest) {
  const tokens = [
    request.cookies.get(SESSION_COOKIE)?.value || "",
    request.cookies.get(REMEMBERED_SESSION_COOKIE)?.value || ""
  ].filter(Boolean);
  const hashes = [...new Set(tokens.map(hashSessionToken))];
  for (const tokenHash of hashes) {
    await query(`DELETE FROM customer_sessions WHERE token_hash = $1`, [tokenHash]);
  }
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  clearRememberedSessionCookie(response);
  return response;
}
