import { NextResponse } from "next/server";
import { authorizeStaff } from "../../../../lib/staff-auth";
import { query } from "../../../../lib/db";
import { getAppClock } from "../../../../lib/app-time";
import { processSubscriptionDayClosures } from "../../../../lib/subscription-maintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CourierRow = {
  id: string;
  subscription_id: string;
  code: string;
  service_date: string;
  requested_time: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  status: string;
  meal_title: string | null;
  meal_description: string | null;
};

export async function GET(request: Request) {
  const auth = await authorizeStaff(request, ["COURIER", "MANAGER"]);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  try {
    await processSubscriptionDayClosures();
    const clock = await getAppClock();
    const result = await query<CourierRow>(
      `SELECT
         sd.id::text,
         s.id::text AS subscription_id,
         s.code,
         sd.service_date::text,
         sd.requested_time,
         COALESCE(NULLIF(BTRIM(sd.customer_name), ''), NULLIF(BTRIM(s.customer_name), ''), u.full_name) AS customer_name,
         COALESCE(NULLIF(BTRIM(sd.customer_phone), ''), NULLIF(BTRIM(s.customer_phone), ''), u.phone) AS customer_phone,
         COALESCE(NULLIF(BTRIM(sd.delivery_address), ''), NULLIF(BTRIM(s.delivery_address), '')) AS delivery_address,
         sd.status::text,
         COALESCE(m.title, '') AS meal_title,
         COALESCE(m.description, '') AS meal_description
       FROM subscription_days sd
       JOIN subscriptions s ON s.id=sd.subscription_id
       JOIN users u ON u.id=s.user_id
       LEFT JOIN meals m ON m.id=sd.meal_id
       WHERE s.status IN ('ACTIVE','COMPLETED')
         AND sd.service_date=$1::date
         AND sd.fulfillment_type='DELIVERY'
         AND sd.status NOT IN ('PAUSED','PAUSE_REQUESTED')
       ORDER BY COALESCE(NULLIF(sd.requested_time,''),'18:00'), customer_name`,
      [clock.date]
    );
    return NextResponse.json({ ok: true, serviceDate: clock.date, generatedAt: clock.iso, testMode: clock.isTestMode, rows: result.rows }, {
      headers: { "Cache-Control": "no-store, max-age=0" }
    });
  } catch (error) {
    console.error("Courier dashboard failed", error);
    return NextResponse.json({ ok: false, error: "Не удалось загрузить доставки" }, { status: 500 });
  }
}
