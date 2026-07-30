import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAccount } from "../../../../lib/auth";
import { query } from "../../../../lib/db";
import { getAppClock } from "../../../../lib/app-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubscriptionRow = {
  id: string;
  code: string;
  status: string;
  selected_days: number;
  remaining_portions: number;
  pause_limit: number;
  pauses_used: number;
  rate_thb: number;
  total_thb: number;
  starts_on: string;
  ends_on: string;
  pickup_point_name: string | null;
  payment_method: string | null;
  paid_at: string | null;
  activated_at: string | null;
  full_name: string;
  phone: string | null;
  created_at: string;
};

type SubscriptionDayRow = {
  subscription_id: string;
  service_date: string;
  status: string;
};

function toIsoDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return String(value || "").match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || "";
}

export async function GET(request: NextRequest) {
  try {
    const account = await getAuthenticatedAccount(request);
    if (!account) return NextResponse.json({ ok: false, error: "Требуется вход" }, { status: 401 });

    const subscriptionsResult = await query<SubscriptionRow>(
      `SELECT s.*, u.full_name, u.phone
       FROM subscriptions s
       JOIN users u ON u.id = s.user_id
       WHERE s.user_id = $1
       ORDER BY s.created_at DESC
       LIMIT 300`,
      [account.userId]
    );

    const ids = subscriptionsResult.rows.map((item) => item.id);
    const daysResult = ids.length
      ? await query<SubscriptionDayRow>(
          `SELECT subscription_id, service_date::text, status
           FROM subscription_days
           WHERE subscription_id = ANY($1::uuid[])
           ORDER BY service_date ASC`,
          [ids]
        )
      : { rows: [] as SubscriptionDayRow[] };

    const daysBySubscription = new Map<string, Array<{ service_date: string; status: string }>>();
    for (const day of daysResult.rows) {
      const current = daysBySubscription.get(day.subscription_id) || [];
      current.push({ service_date: toIsoDate(day.service_date), status: day.status });
      daysBySubscription.set(day.subscription_id, current);
    }

    const today = (await getAppClock()).date;
    return NextResponse.json({
      ok: true,
      subscriptions: subscriptionsResult.rows.map((subscription) => {
        const days = daysBySubscription.get(subscription.id) || [];
        const todayStatus = days.find((day) => day.service_date === today)?.status;
        const qrPausedToday = ["PAUSED", "PAUSE_REQUESTED"].includes(todayStatus || "");
        return {
          ...subscription,
          starts_on: toIsoDate(subscription.starts_on),
          ends_on: toIsoDate(subscription.ends_on),
          code: subscription.status === "ACTIVE" || subscription.status === "COMPLETED" ? subscription.code : null,
          qrEnabled: subscription.status === "ACTIVE" && !qrPausedToday,
          qrPausedToday,
          days
        };
      })
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("List subscriptions failed", error);
    return NextResponse.json({ ok: false, error: "Не удалось загрузить список подписок" }, { status: 500 });
  }
}
