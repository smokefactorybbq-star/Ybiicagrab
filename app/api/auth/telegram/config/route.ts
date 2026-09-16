import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let botUsername = (process.env.TELEGRAM_BOT_USERNAME || process.env.BOT_USERNAME || "").trim().replace(/^@/, "");
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!botUsername && token) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, { cache: "no-store" });
      const data = await response.json() as { ok?: boolean; result?: { username?: string } };
      if (response.ok && data.ok && data.result?.username) botUsername = data.result.username.replace(/^@/, "");
    } catch (error) {
      console.error("Telegram bot username lookup failed", error);
    }
  }
  if (!botUsername) {
    return NextResponse.json(
      { ok: false, error: "Telegram bot не настроен: проверьте TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_USERNAME" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
  return NextResponse.json({ ok: true, botUsername }, { headers: { "Cache-Control": "no-store" } });
}
