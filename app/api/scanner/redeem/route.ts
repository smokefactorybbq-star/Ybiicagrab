import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function POST() {
  return NextResponse.json({ ok: false, error: "Старый маршрут QR-списания отключён. Используется /api/subscriptions/pickup-redeem." }, { status: 410 });
}
