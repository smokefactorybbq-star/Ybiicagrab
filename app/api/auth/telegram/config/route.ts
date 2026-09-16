import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicOrigin() {
  const raw = (process.env.MEALPOINT_PUBLIC_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://www.meal-point.com").trim();
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return url.origin;
  } catch {
    return "https://www.meal-point.com";
  }
}

export async function GET() {
  const configuredUsername = (process.env.TELEGRAM_BOT_USERNAME || process.env.BOT_USERNAME || "").trim().replace(/^@/, "");
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  let botUsername = "";

  // IMPORTANT: the token is the source of truth. A stale TELEGRAM_BOT_USERNAME
  // can point the widget at another bot whose BotFather domain is different.
  if (token) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, { cache: "no-store" });
      const data = await response.json() as { ok?: boolean; result?: { username?: string } };
      if (response.ok && data.ok && data.result?.username) {
        botUsername = data.result.username.replace(/^@/, "");
        if (configuredUsername && configuredUsername.toLowerCase() !== botUsername.toLowerCase()) {
          console.warn(`[telegram-login] TELEGRAM_BOT_USERNAME=${configuredUsername} does not match TELEGRAM_BOT_TOKEN bot @${botUsername}. Token bot is used.`);
        }
      }
    } catch (error) {
      console.error("Telegram bot username lookup failed", error);
    }
  }

  if (!botUsername) botUsername = configuredUsername;
  if (!botUsername) {
    return NextResponse.json(
      { ok: false, error: "Telegram bot не настроен: проверьте TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_USERNAME" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const origin = publicOrigin();
  return NextResponse.json(
    {
      ok: true,
      version: "0.9.3",
      botUsername,
      publicOrigin: origin,
      authUrl: `${origin}/api/auth/telegram/callback`
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
