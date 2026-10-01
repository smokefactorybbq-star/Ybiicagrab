import { NextRequest, NextResponse } from "next/server";
import { findPickupPointByCode } from "../../../../lib/catalog";
import { query } from "../../../../lib/db";
import { verifyPickupLockDeviceKey } from "../../../../lib/pickup-lock";
import { notifyPickupBot } from "../../../../lib/pickup-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_EVENTS = new Set([
  "device_boot",
  "wifi_connected",
  "wifi_restored",
  "wifi_recovered_after_restart",
  "temperature_high",
  "temperature_normal",
  "door_opened",
  "door_locked"
]);

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

  const event = String(body.event || "").trim().toLowerCase();
  if (!ALLOWED_EVENTS.has(event)) {
    return NextResponse.json({ ok:false, error:"UNKNOWN_EVENT" }, { status:400 });
  }

  const reason = String(body.reason || "").trim().slice(0,80) || null;
  const source = String(body.source || "esp32").trim().slice(0,80) || "esp32";
  const firmware = String(body.firmware || "").trim().slice(0,80) || null;
  const temperature = finiteNumber(body.temperature);
  const humidity = finiteNumber(body.humidity);
  const rssi = finiteNumber(body.rssi);

  await query(
    `INSERT INTO pickup_lock_states
       (point_code,last_seen_at,last_event,last_event_at,last_boot_reason,firmware_version,
        temperature_c,humidity_pct,rssi,updated_at)
     VALUES ($1,now(),$2,now(),$3,$4,$5,$6,$7,now())
     ON CONFLICT (point_code) DO UPDATE SET
       last_seen_at=now(),
       last_event=EXCLUDED.last_event,
       last_event_at=now(),
       last_boot_reason=CASE WHEN EXCLUDED.last_event='device_boot' THEN EXCLUDED.last_boot_reason ELSE pickup_lock_states.last_boot_reason END,
       firmware_version=COALESCE(EXCLUDED.firmware_version,pickup_lock_states.firmware_version),
       temperature_c=COALESCE(EXCLUDED.temperature_c,pickup_lock_states.temperature_c),
       humidity_pct=COALESCE(EXCLUDED.humidity_pct,pickup_lock_states.humidity_pct),
       rssi=COALESCE(EXCLUDED.rssi,pickup_lock_states.rssi),
       updated_at=now()`,
    [
      pointCode, event, reason, firmware,
      temperature, humidity, rssi == null ? null : Math.round(rssi)
    ]
  );

  void notifyPickupBot({
    point: pointCode,
    event,
    reason,
    source,
    temperature,
    humidity,
    rssi,
    firmware
  });

  return NextResponse.json({ ok:true }, { headers:{"Cache-Control":"no-store"} });
}
