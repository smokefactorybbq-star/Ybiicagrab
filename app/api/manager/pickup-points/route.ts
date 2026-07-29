import { NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { getBangkokTodayIso } from "../../../../lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PointSummaryRow = {
  pickup_point_name: string;
  planned_count: number;
  picked_up_count: number;
  delivered_count: number;
};

type UncollectedRow = {
  pickup_point_name: string;
  full_name: string;
  phone: string | null;
  portions: number;
  subscription_codes: string[];
};

function authorize(request: Request) {
  const configuredPassword = process.env.MANAGER_PASSWORD;
  const suppliedPassword = request.headers.get("x-manager-password");

  if (!configuredPassword) return { ok: false, error: "MANAGER_PASSWORD не задан", status: 503 };
  if (suppliedPassword !== configuredPassword) return { ok: false, error: "Неверный пароль", status: 401 };
  return { ok: true, error: "", status: 200 };
}

function getBangkokHour() {
  const value = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    hourCycle: "h23"
  }).format(new Date());
  return Number(value);
}

function getDayEndHour() {
  const parsed = Number(process.env.PICKUP_POINT_DAY_END_HOUR || "20");
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 23 ? parsed : 20;
}

export async function GET(request: Request) {
  const auth = authorize(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const serviceDate = getBangkokTodayIso();
    const dayEndHour = getDayEndHour();

    const [summaryResult, uncollectedResult] = await Promise.all([
      query<PointSummaryRow>(
        `WITH day_rows AS (
           SELECT
             COALESCE(NULLIF(BTRIM(s.pickup_point_name), ''), 'Пункт не указан') AS pickup_point_name,
             sd.status
           FROM subscription_days sd
           JOIN subscriptions s ON s.id = sd.subscription_id
           WHERE s.status IN ('ACTIVE', 'COMPLETED')
             AND sd.service_date = $1::date
             AND sd.status IN ('PLANNED', 'AVAILABLE', 'REDEEMED')
         ),
         aggregates AS (
           SELECT
             pickup_point_name,
             COUNT(*)::int AS planned_count,
             COUNT(*) FILTER (WHERE status = 'REDEEMED')::int AS picked_up_count
           FROM day_rows
           GROUP BY pickup_point_name
         ),
         inventory AS (
           SELECT pickup_point_name, delivered_count
           FROM pickup_point_daily_inventory
           WHERE service_date = $1::date
         ),
         points AS (
           SELECT pickup_point_name FROM aggregates
           UNION
           SELECT pickup_point_name FROM inventory
         )
         SELECT
           p.pickup_point_name,
           COALESCE(a.planned_count, 0)::int AS planned_count,
           COALESCE(a.picked_up_count, 0)::int AS picked_up_count,
           COALESCE(i.delivered_count, a.planned_count, 0)::int AS delivered_count
         FROM points p
         LEFT JOIN aggregates a USING (pickup_point_name)
         LEFT JOIN inventory i USING (pickup_point_name)
         ORDER BY p.pickup_point_name`,
        [serviceDate]
      ),
      query<UncollectedRow>(
        `SELECT
           COALESCE(NULLIF(BTRIM(s.pickup_point_name), ''), 'Пункт не указан') AS pickup_point_name,
           u.full_name,
           u.phone,
           COUNT(*)::int AS portions,
           array_agg(s.code ORDER BY s.code) AS subscription_codes
         FROM subscription_days sd
         JOIN subscriptions s ON s.id = sd.subscription_id
         JOIN users u ON u.id = s.user_id
         WHERE s.status = 'ACTIVE'
           AND sd.service_date = $1::date
           AND sd.status IN ('PLANNED', 'AVAILABLE')
         GROUP BY pickup_point_name, u.id, u.full_name, u.phone
         ORDER BY pickup_point_name, u.full_name`,
        [serviceDate]
      )
    ]);

    const uncollectedByPoint = new Map<string, UncollectedRow[]>();
    for (const client of uncollectedResult.rows) {
      const current = uncollectedByPoint.get(client.pickup_point_name) || [];
      current.push({
        ...client,
        portions: Number(client.portions),
        subscription_codes: Array.isArray(client.subscription_codes) ? client.subscription_codes : []
      });
      uncollectedByPoint.set(client.pickup_point_name, current);
    }

    const points = summaryResult.rows.map((row) => {
      const deliveredCount = Number(row.delivered_count);
      const pickedUpCount = Number(row.picked_up_count);
      return {
        pickupPointName: row.pickup_point_name,
        plannedCount: Number(row.planned_count),
        deliveredCount,
        pickedUpCount,
        remainingCount: Math.max(0, deliveredCount - pickedUpCount),
        uncollectedClients: uncollectedByPoint.get(row.pickup_point_name) || []
      };
    });

    return NextResponse.json({
      ok: true,
      serviceDate,
      dayEndHour,
      isEndOfDay: getBangkokHour() >= dayEndHour,
      points
    }, {
      headers: { "Cache-Control": "no-store, max-age=0" }
    });
  } catch (error) {
    console.error("Manager pickup point dashboard failed", error);
    return NextResponse.json({ ok: false, error: "Не удалось загрузить остатки в пунктах выдачи" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = authorize(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const body = await request.json() as { pickupPointName?: unknown; deliveredCount?: unknown };
    const pickupPointName = typeof body.pickupPointName === "string" ? body.pickupPointName.trim().slice(0, 160) : "";
    const deliveredCount = Number(body.deliveredCount);

    if (!pickupPointName || !Number.isInteger(deliveredCount) || deliveredCount < 0 || deliveredCount > 10000) {
      return NextResponse.json({ ok: false, error: "Некорректное количество доставленных обедов" }, { status: 400 });
    }

    const serviceDate = getBangkokTodayIso();
    await query(
      `INSERT INTO pickup_point_daily_inventory (service_date, pickup_point_name, delivered_count)
       VALUES ($1::date, $2, $3)
       ON CONFLICT (service_date, pickup_point_name)
       DO UPDATE SET delivered_count = EXCLUDED.delivered_count, updated_at = now()`,
      [serviceDate, pickupPointName, deliveredCount]
    );

    return NextResponse.json({ ok: true, serviceDate, pickupPointName, deliveredCount });
  } catch (error) {
    console.error("Update pickup point delivery count failed", error);
    return NextResponse.json({ ok: false, error: "Не удалось сохранить количество доставленных обедов" }, { status: 500 });
  }
}
