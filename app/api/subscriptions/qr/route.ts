import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({ ok: false, error: "Старый персональный QR отключён. Для выдачи используется QR точки самовывоза из личного кабинета." }, { status: 410 });
}
