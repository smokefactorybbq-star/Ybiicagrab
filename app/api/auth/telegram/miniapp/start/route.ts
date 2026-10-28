import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { query } from "../../../../../../lib/db";
import { getTelegramLoginBotInfo, hashTelegramLoginToken } from "../../../../../../lib/telegram-miniapp-login";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const bot = await getTelegramLoginBotInfo();
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashTelegramLoginToken(token);
    await query(`DELETE FROM telegram_login_requests WHERE expires_at <= now() OR consumed_at IS NOT NULL AND consumed_at < now() - interval '1 day'`);
    await query(
      `INSERT INTO telegram_login_requests (token_hash, expires_at) VALUES ($1, now() + interval '10 minutes')`,
      [tokenHash]
    );
    const startParam = `mplogin_${token}`;
    const rawOrigin = (process.env.MEALPOINT_PUBLIC_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://meal-point.com").trim();
    let origin = "https://meal-point.com";
    try { origin = new URL(rawOrigin.includes("://") ? rawOrigin : `https://${rawOrigin}`).origin; } catch {}
    return NextResponse.json({
      ok: true,
      token,
      botUsername: bot.username,
      hasMainWebApp: bot.hasMainWebApp,
      telegramUrl: `https://t.me/${bot.username}?startapp=${encodeURIComponent(startParam)}`,
      miniAppUrl: `${origin}/telegram-login`,
      expiresIn: 600
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Telegram Mini App login start failed", error);
    return NextResponse.json(
      { ok: false, error: "Telegram-бот для входа не настроен. Проверьте TELEGRAM_BOT_TOKEN." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
