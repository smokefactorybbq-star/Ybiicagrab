import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function POST() {
  return NextResponse.json({ ok: false, error: "Регистрация по паролю отключена. Используйте вход через Telegram." }, { status: 410 });
}
