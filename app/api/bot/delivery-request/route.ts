import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const expected = process.env.BOT_API_KEY || "";
  const supplied = request.headers.get("x-bot-api-key") || request.nextUrl.searchParams.get("key") || "";
  if (!expected || supplied !== expected) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const token = request.nextUrl.searchParams.get("token")?.trim() || "";
  if (!token) return NextResponse.json({ ok: false, error: "Token required" }, { status: 400 });

  const result = await query(
    `UPDATE pickup_delivery_requests
     SET telegram_started_at = COALESCE(telegram_started_at, now()), updated_at = now()
     WHERE public_token = $1
     RETURNING id, subscription_id, service_date::text, pickup_point_name,
               customer_name, customer_phone, delivery_address,
               delivery_type, requested_time, status, created_at`,
    [token]
  );
  const requestRow = result.rows[0];
  if (!requestRow) return NextResponse.json({ ok: false, error: "Request not found" }, { status: 404 });
  return NextResponse.json({ ok: true, request: requestRow });
}
