import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function POST() {
  return NextResponse.json({ ok: false, error: "Регистрация по паролю отключена. Используйте вход по телефону и SMS-коду." }, { status: 410 });
}
