import { NextResponse } from "next/server";
import { getAppClock, isValidTestDateTime } from "../../../../lib/app-time";
import { query } from "../../../../lib/db";
import { authorizeManager } from "../../../../lib/manager-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = authorizeManager(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const clock = await getAppClock();
  return NextResponse.json({ ok: true, clock }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const auth = authorizeManager(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await request.json() as { enabled?: unknown; localDateTime?: unknown };
  const enabled = body.enabled === true;
  const localDateTime = typeof body.localDateTime === "string" ? body.localDateTime.trim() : "";
  if (enabled && !isValidTestDateTime(localDateTime)) {
    return NextResponse.json({ ok: false, error: "Укажите корректные дату и время" }, { status: 400 });
  }

  await query(
    `INSERT INTO app_runtime_settings (id, test_mode, test_datetime_local, updated_at)
     VALUES (1, $1, $2, now())
     ON CONFLICT (id) DO UPDATE
       SET test_mode = EXCLUDED.test_mode,
           test_datetime_local = EXCLUDED.test_datetime_local,
           updated_at = now()`,
    [enabled, enabled ? localDateTime : null]
  );
  const clock = await getAppClock();
  return NextResponse.json({ ok: true, clock });
}
