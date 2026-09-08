import { NextRequest, NextResponse } from "next/server";
import { createBrowserSession, setSessionCookie, upsertTelegramIdentity, validateTelegramWebAppInitData } from "../../../../lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { initData?: unknown };
    const initData = typeof body.initData === "string" ? body.initData : "";
    const identity = validateTelegramWebAppInitData(initData);
    const user = await upsertTelegramIdentity(identity);
    const token = await createBrowserSession(user.id);
    const response = NextResponse.json({ ok: true, telegramId: identity.id });
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Telegram auth failed" }, { status: 401 });
  }
}
