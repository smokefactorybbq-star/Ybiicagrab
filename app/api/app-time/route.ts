import { NextResponse } from "next/server";
import { getAppClock } from "../../../lib/app-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const clock = await getAppClock();
  return NextResponse.json({ ok: true, clock }, { headers: { "Cache-Control": "no-store" } });
}
