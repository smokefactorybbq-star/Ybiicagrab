import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function POST() {
  return NextResponse.json({ ok: false, error: "Вход по паролю отключён. Используйте вход по телефону и SMS-коду." }, { status: 410 });
}
