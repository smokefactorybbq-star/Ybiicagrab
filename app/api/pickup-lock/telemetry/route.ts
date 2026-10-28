import { NextRequest, NextResponse } from "next/server";
import { findPickupPointByCode } from "../../../../lib/catalog";
import { query } from "../../../../lib/db";
import { verifyPickupLockDeviceKey } from "../../../../lib/pickup-lock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function finiteNumber(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const pointCode = String(body.point || request.nextUrl.searchParams.get("point") || "").trim().toLowerCase();
  const point = await findPickupPointByCode(pointCode);
  const deviceKey = (request.headers.get("x-device-key") || "").trim();

  if (!point || !verifyPickupLockDeviceKey(pointCode, deviceKey)) {
    return NextResponse.json({ ok:false }, { status:401, headers:{"Cache-Control":"no-store"} });
  }

  const temperature = finiteNumber(body.temperature);
  const humidity = finiteNumber(body.humidity);
  const rssi = finiteNumber(body.rssi);

  if (temperature == null || temperature < -50 || temperature > 100 ||
      humidity == null || humidity < 0 || humidity > 100) {
    return NextResponse.json({ ok:false, error:"INVALID_SENSOR_DATA" }, { status:400 });
  }

  await query(
    `INSERT INTO pickup_lock_states
       (point_code,last_seen_at,temperature_c,humidity_pct,last_telemetry_at,rssi,updated_at)
     VALUES ($1,now(),$2,$3,now(),$4,now())
     ON CONFLICT (point_code) DO UPDATE SET
       last_seen_at=now(),
       temperature_c=EXCLUDED.temperature_c,
       humidity_pct=EXCLUDED.humidity_pct,
       last_telemetry_at=now(),
       rssi=EXCLUDED.rssi,
       updated_at=now()`,
    [pointCode, temperature, humidity, rssi == null ? null : Math.round(rssi)]
  );

  return NextResponse.json({ ok:true }, { headers:{"Cache-Control":"no-store"} });
}
