import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function POST() {
  return NextResponse.json({ok:false,error:"QR-списание отключено"},{status:410});
}
