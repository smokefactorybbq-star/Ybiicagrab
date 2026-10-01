import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { findPickupPointByCode } from "../../../../lib/catalog";
import { query } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validSecret(supplied: string) {
  const expected = (process.env.MEALPOINT_BOT_SECRET || "").trim();
  if (expected.length < 16 || supplied.length !== expected.length) return false;
  const a = Buffer.from(supplied, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const secret = (request.headers.get("x-mealpoint-secret") || "").trim();
  if (!validSecret(secret)) {
    return NextResponse.json({ok:false,error:"UNAUTHORIZED"},{status:401});
  }

  const pointCode = (request.nextUrl.searchParams.get("point") || "patong").trim().toLowerCase();
  const point = await findPickupPointByCode(pointCode);
  if (!point) return NextResponse.json({ok:false,error:"POINT_NOT_FOUND"},{status:404});

  const result = await query<{
    last_seen_at:string|null;
    seconds_since_last_seen:number|null;
    temperature_c:number|null;
    humidity_pct:number|null;
    last_telemetry_at:string|null;
    rssi:number|null;
    firmware_version:string|null;
  }>(
    `SELECT last_seen_at,
            CASE WHEN last_seen_at IS NULL THEN NULL
                 ELSE EXTRACT(EPOCH FROM (now()-last_seen_at))::int END AS seconds_since_last_seen,
            temperature_c,humidity_pct,last_telemetry_at,rssi,firmware_version
     FROM pickup_lock_states WHERE point_code=$1`,
    [pointCode]
  );
  const row = result.rows[0];

  return NextResponse.json({
    ok:true,
    point:pointCode,
    lastSeenAt:row?.last_seen_at || null,
    secondsSinceLastSeen:row?.seconds_since_last_seen == null ? null : Number(row.seconds_since_last_seen),
    temperature:row?.temperature_c == null ? null : Number(row.temperature_c),
    humidity:row?.humidity_pct == null ? null : Number(row.humidity_pct),
    lastTelemetryAt:row?.last_telemetry_at || null,
    rssi:row?.rssi ?? null,
    firmware:row?.firmware_version || null
  },{headers:{"Cache-Control":"private, no-store"}});
}
