import { NextRequest, NextResponse } from "next/server";
import { authorizeManager } from "../../../../lib/manager-auth";
import { isSameOriginMutation } from "../../../../lib/request-security";
import { findPickupPointByCode } from "../../../../lib/catalog";
import { query, withTransaction } from "../../../../lib/db";
import {
  getPickupLockOnlineTtlSeconds,
  getPickupLockOpenSeconds,
  isPickupLockConfigured,
  requestPickupLockManualOpen
} from "../../../../lib/pickup-lock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authorizeManager(request);
  if (!auth.ok) return NextResponse.json(auth, { status:auth.status });

  const pointCode = (request.nextUrl.searchParams.get("point") || "patong").trim().toLowerCase();
  const point = await findPickupPointByCode(pointCode);
  if (!point) return NextResponse.json({ok:false,error:"Точка не найдена"},{status:404});

  const ttl = getPickupLockOnlineTtlSeconds();
  const result = await query<{
    open_until:string|null; last_seen_at:string|null; temperature_c:number|null; humidity_pct:number|null;
    last_telemetry_at:string|null; rssi:number|null; firmware_version:string|null; last_event:string|null;
    last_event_at:string|null; last_boot_reason:string|null; online:boolean;
  }>(
    `SELECT open_until,last_seen_at,temperature_c,humidity_pct,last_telemetry_at,rssi,firmware_version,
            last_event,last_event_at,last_boot_reason,
            COALESCE(last_seen_at >= now() - ($2::int * interval '1 second'),false) AS online
     FROM pickup_lock_states WHERE point_code=$1`,
    [pointCode, ttl]
  );
  const row = result.rows[0];

  return NextResponse.json({
    ok:true,
    point:{code:point.code,name:point.name},
    configured:isPickupLockConfigured(pointCode),
    online:Boolean(row?.online),
    open:Boolean(row?.open_until && new Date(row.open_until).getTime() > Date.now()),
    openUntil:row?.open_until || null,
    lastSeenAt:row?.last_seen_at || null,
    temperature:row?.temperature_c == null ? null : Number(row.temperature_c),
    humidity:row?.humidity_pct == null ? null : Number(row.humidity_pct),
    lastTelemetryAt:row?.last_telemetry_at || null,
    rssi:row?.rssi ?? null,
    firmware:row?.firmware_version || null,
    lastEvent:row?.last_event || null,
    lastEventAt:row?.last_event_at || null,
    lastBootReason:row?.last_boot_reason || null,
    openSeconds:getPickupLockOpenSeconds()
  },{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ok:false,error:"Недопустимый источник запроса"},{status:403});
  }
  const auth = await authorizeManager(request);
  if (!auth.ok) return NextResponse.json(auth,{status:auth.status});

  const body = await request.json().catch(() => ({})) as {point?:unknown;action?:unknown};
  const pointCode = typeof body.point === "string" ? body.point.trim().toLowerCase() : "patong";
  const action = typeof body.action === "string" ? body.action : "";

  if (action !== "open") return NextResponse.json({ok:false,error:"Неизвестная команда"},{status:400});
  const point = await findPickupPointByCode(pointCode);
  if (!point) return NextResponse.json({ok:false,error:"Точка не найдена"},{status:404});
  if (!isPickupLockConfigured(pointCode)) {
    return NextResponse.json({ok:false,error:"Замок не настроен"},{status:503});
  }

  try {
    const seconds = await withTransaction(async (client) => {
      const ttl = getPickupLockOnlineTtlSeconds();
      const status = await client.query<{online:boolean}>(
        `SELECT EXISTS (
           SELECT 1 FROM pickup_lock_states
           WHERE point_code=$1 AND last_seen_at >= now() - ($2::int * interval '1 second')
         ) AS online`,
        [pointCode, ttl]
      );
      if (!status.rows[0]?.online) throw new Error("LOCK_OFFLINE");
      return requestPickupLockManualOpen(client, pointCode);
    });
    return NextResponse.json({ok:true,openSeconds:seconds,message:`Команда открытия отправлена на ${seconds} сек.`});
  } catch (error) {
    if (error instanceof Error && error.message === "LOCK_OFFLINE") {
      return NextResponse.json({ok:false,error:"ESP32 сейчас не на связи. Команда не отправлена."},{status:503});
    }
    console.error("Manager pickup lock open failed",error);
    return NextResponse.json({ok:false,error:"Не удалось открыть замок"},{status:500});
  }
}
