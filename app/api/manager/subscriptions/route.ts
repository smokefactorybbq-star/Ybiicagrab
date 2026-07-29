import { NextResponse } from "next/server";
import { query, withTransaction } from "../../../../lib/db";
import { createSubscriptionCode } from "../../../../lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ManagerSubscriptionRow = {
  id: string;
  code: string;
  status: string;
  full_name: string;
  phone: string | null;
  pickup_point_name: string | null;
  payment_method: string | null;
  selected_days: number;
  remaining_portions: number;
  pause_limit: number;
  pauses_used: number;
  rate_thb: number;
  total_thb: number;
  paid_at: string | null;
  activated_at: string | null;
  created_at: string;
  dates: string[];
};

function authorize(request: Request) {
  const configuredPassword = process.env.MANAGER_PASSWORD;
  const suppliedPassword = request.headers.get("x-manager-password");

  if (!configuredPassword) return { ok: false, error: "MANAGER_PASSWORD не задан", status: 503 };
  if (suppliedPassword !== configuredPassword) return { ok: false, error: "Неверный пароль", status: 401 };
  return { ok: true, error: "", status: 200 };
}

export async function GET(request: Request) {
  const auth = authorize(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const result = await query<ManagerSubscriptionRow>(
      `SELECT
         s.id,
         s.code,
         s.status,
         u.full_name,
         u.phone,
         s.pickup_point_name,
         s.payment_method,
         s.selected_days,
         s.remaining_portions,
         s.pause_limit,
         s.pauses_used,
         s.rate_thb,
         s.total_thb,
         s.paid_at,
         s.activated_at,
         s.created_at,
         COALESCE(
           array_agg(sd.service_date::text ORDER BY sd.service_date)
             FILTER (WHERE sd.id IS NOT NULL),
           ARRAY[]::text[]
         ) AS dates
       FROM subscriptions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN subscription_days sd ON sd.subscription_id = s.id
       GROUP BY s.id, u.id
       ORDER BY CASE WHEN s.status = 'AWAITING_ACTIVATION' THEN 0 ELSE 1 END, s.created_at DESC
       LIMIT 200`
    );

    return NextResponse.json({ ok: true, subscriptions: result.rows });
  } catch (error) {
    console.error("Manager subscriptions failed", error);
    return NextResponse.json({ ok: false, error: "Не удалось загрузить таблицу" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = authorize(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const body = await request.json() as { id?: unknown; action?: unknown };
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const action = typeof body.action === "string" ? body.action.trim() : "";

    if (!id || action !== "activate") {
      return NextResponse.json({ ok: false, error: "Некорректная команда" }, { status: 400 });
    }

    const activated = await withTransaction(async (client) => {
      const current = await client.query<{ id: string; status: string }>(
        `SELECT id, status FROM subscriptions WHERE id = $1 FOR UPDATE`,
        [id]
      );
      const subscription = current.rows[0];
      if (!subscription) throw new Error("NOT_FOUND");
      if (subscription.status === "ACTIVE") return null;
      if (subscription.status !== "AWAITING_ACTIVATION") throw new Error("WRONG_STATUS");

      const code = createSubscriptionCode();
      await client.query(
        `UPDATE subscriptions
         SET status = 'ACTIVE', code = $1, activated_at = now(), updated_at = now()
         WHERE id = $2`,
        [code, id]
      );
      await client.query(
        `UPDATE subscription_days
         SET status = 'AVAILABLE'
         WHERE subscription_id = $1 AND status = 'PLANNED'`,
        [id]
      );
      await client.query(
        `INSERT INTO manager_events (event_type, entity_id, payload)
         VALUES ('SUBSCRIPTION_ACTIVATED', $1, $2::jsonb)`,
        [id, JSON.stringify({ code })]
      );
      return code;
    });

    return NextResponse.json({ ok: true, code: activated });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const message = code === "NOT_FOUND"
      ? "Подписка не найдена"
      : code === "WRONG_STATUS"
        ? "Эту подписку нельзя активировать"
        : "Не удалось активировать подписку";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
