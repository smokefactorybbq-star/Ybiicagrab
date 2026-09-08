import { NextRequest, NextResponse } from "next/server";
import { findPickupQrPointByCode } from "../../../data/pickupQrPoints";
import { query } from "../../../lib/db";
import { getPickupLockOpenSeconds, verifyPickupLockDeviceKey } from "../../../lib/pickup-lock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const pointCode = (request.nextUrl.searchParams.get("point") || "").trim().toLowerCase();
  const point = findPickupQrPointByCode(pointCode);
  const deviceKey = (request.headers.get("x-device-key") || "").trim();

  if (!point || !verifyPickupLockDeviceKey(pointCode, deviceKey)) {
    return NextResponse.json({ ok: false, open: false }, {
      status: 401,
      headers: { "Cache-Control": "no-store" }
    });
  }

  try {
    const result = await query<{ open: boolean; open_until: string | null; server_time: string }>(
      `INSERT INTO pickup_lock_states (point_code, last_seen_at, updated_at)
       VALUES ($1, now(), now())
       ON CONFLICT (point_code) DO UPDATE SET
         last_seen_at=now(),
         updated_at=now()
       RETURNING
         COALESCE(open_until > now(), false) AS open,
         open_until,
         now()::text AS server_time`,
      [pointCode]
    );

    const row = result.rows[0];
    return NextResponse.json({
      ok: true,
      point: pointCode,
      open: Boolean(row?.open),
      openUntil: row?.open_until || null,
      serverTime: row?.server_time || null,
      configuredOpenSeconds: getPickupLockOpenSeconds()
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Pickup lock poll failed", error);
    return NextResponse.json({ ok: false, open: false }, {
      status: 503,
      headers: { "Cache-Control": "no-store" }
    });
  }
}
