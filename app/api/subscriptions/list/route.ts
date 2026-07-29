import { NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { getBangkokTodayIso, hashToken } from "../../../../lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CredentialInput = {
  id?: unknown;
  accessToken?: unknown;
};

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
  account_access_hash: string | null;
  qr_secret_hash: string;
};

type SubscriptionDayRow = {
  subscription_id: string;
  service_date: string;
  status: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toIsoDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || "";
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { credentials?: unknown };
    const rawCredentials = Array.isArray(body.credentials) ? body.credentials : [];

    const credentials = rawCredentials
      .slice(0, 200)
      .map((item) => item as CredentialInput)
      .map((item) => ({
        id: typeof item.id === "string" ? item.id.trim() : "",
        accessToken: typeof item.accessToken === "string" ? item.accessToken.trim() : ""
      }))
      .filter((item) => UUID_PATTERN.test(item.id) && item.accessToken.length >= 20);

    if (!credentials.length) {
      return NextResponse.json({ ok: true, subscriptions: [] });
    }

    const tokenById = new Map(credentials.map((item) => [item.id, item.accessToken]));
    const ids = [...tokenById.keys()];

    const subscriptionsResult = await query<SubscriptionRow>(
      `SELECT s.*, u.full_name, u.phone
       FROM subscriptions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ANY($1::uuid[])
       ORDER BY s.created_at DESC`,
      [ids]
    );

    const authorized = subscriptionsResult.rows.filter((subscription) => {
      const token = tokenById.get(subscription.id);
      const expectedHash = subscription.account_access_hash || subscription.qr_secret_hash;
      return Boolean(token && expectedHash && hashToken(token) === expectedHash);
    });

    if (!authorized.length) {
      return NextResponse.json({ ok: true, subscriptions: [] });
    }

    const authorizedIds = authorized.map((item) => item.id);
    const daysResult = await query<SubscriptionDayRow>(
      `SELECT subscription_id, service_date::text, status
       FROM subscription_days
       WHERE subscription_id = ANY($1::uuid[])
       ORDER BY service_date ASC`,
      [authorizedIds]
    );

    const daysBySubscription = new Map<string, Array<{ service_date: string; status: string }>>();
    for (const day of daysResult.rows) {
      const current = daysBySubscription.get(day.subscription_id) || [];
      current.push({ service_date: toIsoDate(day.service_date), status: day.status });
      daysBySubscription.set(day.subscription_id, current);
    }

    return NextResponse.json({
      ok: true,
      subscriptions: authorized.map((subscription) => {
        const {
          account_access_hash: _accountHash,
          qr_secret_hash: _qrHash,
          ...safeSubscription
        } = subscription;

        const days = daysBySubscription.get(subscription.id) || [];
        const todayStatus = days.find((day) => day.service_date === getBangkokTodayIso())?.status;
        const qrPausedToday = ["PAUSED", "PAUSE_REQUESTED"].includes(todayStatus || "");

        return {
          ...safeSubscription,
          starts_on: toIsoDate(subscription.starts_on),
          ends_on: toIsoDate(subscription.ends_on),
          code: subscription.status === "ACTIVE" ? subscription.code : null,
          qrEnabled: subscription.status === "ACTIVE" && !qrPausedToday,
          qrPausedToday,
          days
        };
      })
    });
  } catch (error) {
    console.error("List subscriptions failed", error);
    return NextResponse.json({ ok: false, error: "Не удалось загрузить список подписок" }, { status: 500 });
  }
}
