import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const LEGACY_GOOGLE_MAPS_BROWSER_KEY = "AIzaSyBWF8CVNlAbdhdi6JL2ZJnwsQ_igxGNE5c";

export async function GET() {
  return NextResponse.json({
    ok: true,
    telegramBotUsername: (process.env.TELEGRAM_BOT_USERNAME || "").replace(/^@/, "").trim(),
    googleMapsBrowserKey: (
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_MAPS_BROWSER_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_MAPS_KEY ||
      LEGACY_GOOGLE_MAPS_BROWSER_KEY
    ).trim()
  }, { headers: { "Cache-Control": "no-store" } });
}
