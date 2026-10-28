import { NextRequest, NextResponse } from "next/server";
import { getOrCreateTelegramAccount } from "../../../../../../lib/auth";
import { query } from "../../../../../../lib/db";
import { hashTelegramLoginToken, verifyTelegramMiniAppInitData } from "../../../../../../lib/telegram-miniapp-login";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const initData = String(body.initData || "");
    const verified = verifyTelegramMiniAppInitData(initData);
    const match = /^mplogin_([A-Za-z0-9_-]{20,100})$/.exec(verified.startParam);
    if (!match) throw new Error("BAD_LOGIN_START_PARAM");
    const tokenHash = hashTelegramLoginToken(match[1]);

    const pending = await query<{ id: string }>(
      `SELECT id::text FROM telegram_login_requests
       WHERE token_hash = $1 AND expires_at > now() AND consumed_at IS NULL AND approved_user_id IS NULL
       LIMIT 1`,
      [tokenHash]
    );
    if (!pending.rows[0]) throw new Error("LOGIN_REQUEST_EXPIRED");

    const tg = verified.user;
    const userId = await getOrCreateTelegramAccount({
      id: String(tg.id),
      first_name: tg.first_name || "",
      last_name: tg.last_name || "",
      username: tg.username || "",
      photo_url: tg.photo_url || "",
      auth_date: String(verified.authDate),
      hash: "miniapp"
    });

    await query(
      `UPDATE telegram_login_requests
       SET approved_user_id = $1, approved_at = now()
       WHERE id = $2 AND consumed_at IS NULL AND approved_user_id IS NULL`,
      [userId, pending.rows[0].id]
    );

    return NextResponse.json({
      ok: true,
      account: {
        telegramId: String(tg.id),
        firstName: tg.first_name || "",
        lastName: tg.last_name || "",
        username: tg.username || ""
      }
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "TELEGRAM_MINIAPP_LOGIN_FAILED";
    console.error("Telegram Mini App login approval failed", error);
    const message = code === "LOGIN_REQUEST_EXPIRED"
      ? "Ссылка для входа истекла. Вернитесь на сайт и нажмите «Войти через Telegram» ещё раз."
      : "Не удалось подтвердить Telegram-аккаунт. Откройте вход заново с сайта MealPoint.";
    return NextResponse.json({ ok: false, error: message, code }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
}
