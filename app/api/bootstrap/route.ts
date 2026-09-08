import { NextRequest, NextResponse } from "next/server";
import {
  createBrowserSession, getAuthenticatedAccount, setSessionCookie, upsertTelegramIdentity,
  validateTelegramWebAppInitData
} from "../../../lib/auth";
import { getShopAccountData } from "../../../lib/shop-account";
import { query } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    let account = await getAuthenticatedAccount(request);
    let newToken = "";

    if (!account) {
      const initData = request.headers.get("x-telegram-init-data") || "";
      if (!initData) return NextResponse.json({ ok: false, error: "Telegram authorization required" }, { status: 401 });
      const identity = validateTelegramWebAppInitData(initData);
      const user = await upsertTelegramIdentity(identity);
      newToken = await createBrowserSession(user.id);
      account = {
        userId: user.id,
        telegramId: user.telegram_id,
        username: user.username || "",
        fullName: user.full_name,
        phone: user.phone || "",
        address: user.address || "",
        photoUrl: user.photo_url || "",
        termsAcceptedAt: null
      };
    }

    const body = await request.json().catch(() => ({})) as { sessionKey?: unknown };
    const sessionKey = typeof body.sessionKey === "string" ? body.sessionKey.slice(0, 120) : null;
    await query(`UPDATE users SET last_site_visit_at=now(), updated_at=now() WHERE telegram_id=$1`, [account.telegramId]);
    await query(`INSERT INTO visits (telegram_id,session_key,user_agent) VALUES ($1,$2,$3)`, [account.telegramId, sessionKey, request.headers.get("user-agent")?.slice(0, 500) || null]);

    const data = await getShopAccountData(account.telegramId);
    if (!data) throw new Error("Account not found");
    const response = NextResponse.json({ ok: true, ...data });
    if (newToken) setSessionCookie(response, newToken);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ ok: false, error: message }, { status: /auth|telegram|signature|missing|expired|invalid/i.test(message) ? 401 : 500 });
  }
}
