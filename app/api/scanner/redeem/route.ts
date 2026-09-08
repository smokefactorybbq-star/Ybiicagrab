import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function POST() {
  return NextResponse.json({ok:false,error:"QR-списание отключено. День подписки списывается автоматически после 18:00, если не поставлен на паузу."},{status:410});
}
