import { NextResponse } from "next/server";
import { query, withTransaction } from "../../../../lib/db";
import { authorizeManager } from "../../../../lib/manager-auth";
import { createSubscriptionCode } from "../../../../lib/subscriptions";
import { isSameOriginMutation } from "../../../../lib/request-security";

import { processSubscriptionDayClosures } from "../../../../lib/subscription-maintenance";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ManagerSubscriptionRow = {
  id: string;
  user_id: string;
  code: string;
  status: string;
  full_name: string;
  phone: string | null;
  pickup_point_name: string | null;
  fulfillment_type: string;
  payment_method: string | null;
  limen_state: string | null;
  limen_test: boolean | null;
  limen_order_id: string | null;
  limen_amount_rub: string | null;

  selected_days: number;
  remaining_portions: number;
  pause_limit: number;
  pauses_used: number;
  rate_thb: number;
  total_thb: number;
  paid_at: string | null;
  activated_at: string | null;
  created_at: string;
  manager_unread_count: number;
  dates: Array<{ service_date: string; status: string }>;
};

export async function GET(request: Request) {
  const auth = await authorizeManager(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  await processSubscriptionDayClosures();

  try {
    const result = await query<ManagerSubscriptionRow>(
      `SELECT
         s.id,
         u.id AS user_id,
         s.code,
         s.status,
         COALESCE(
           NULLIF(s.customer_name, ''),
           NULLIF(u.profile_name, ''),
           NULLIF(u.full_name, ''),
           'Клиент MealPoint'
         ) AS full_name,
         COALESCE(
           NULLIF(s.customer_phone, ''),
           NULLIF(ca.phone, ''),
           NULLIF(u.phone, '')
         ) AS phone,
         COALESCE(NULLIF(s.pickup_point_name, ''), day_info.pickup_point_name) AS pickup_point_name,
         s.fulfillment_type,
         s.payment_method,
         lp.state AS limen_state,
         lp.test AS limen_test,
         lp.provider_id AS limen_order_id,
         lp.amount_rub AS limen_amount_rub,
         s.selected_days,
         s.remaining_portions,
         s.pause_limit,
         s.pauses_used,
         s.rate_thb,
         s.total_thb,
         s.paid_at,
         s.activated_at,
         s.created_at,
         COALESCE((
           SELECT COUNT(*)::int
           FROM customer_conversations cc
           JOIN customer_messages cm ON cm.conversation_id = cc.id
           WHERE cc.user_id = u.id
             AND cm.sender_role = 'CUSTOMER'
             AND cm.read_by_manager_at IS NULL
         ), 0)::int AS manager_unread_count,
         COALESCE(day_info.dates, '[]'::json) AS dates
       FROM subscriptions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN limenthai_payments lp ON lp.subscription_id = s.id AND s.payment_method = 'BANK_RU' 
       LEFT JOIN customer_accounts ca ON ca.user_id = u.id
       LEFT JOIN LATERAL (
         SELECT
           COALESCE(
             json_agg(
               json_build_object(
                 'service_date', sd.service_date::text,
                 'status', sd.status::text
               ) ORDER BY sd.service_date
             ) FILTER (WHERE sd.id IS NOT NULL),
             '[]'::json
           ) AS dates,
           MIN(pp.name) FILTER (WHERE pp.name IS NOT NULL) AS pickup_point_name
         FROM subscription_days sd
         LEFT JOIN pickup_points pp ON pp.id = sd.pickup_point_id
         WHERE sd.subscription_id = s.id
       ) day_info ON TRUE
       ORDER BY CASE WHEN s.status = 'AWAITING_ACTIVATION' THEN 0 ELSE 1 END, s.created_at DESC
       LIMIT 300`
    );

    return NextResponse.json({ ok: true, subscriptions: result.rows }, {
      headers: { "Cache-Control": "no-store, max-age=0" }
    });
  } catch (error) {
    console.error("Manager subscriptions failed", error);
    return NextResponse.json({ ok: false, error: "Не удалось загрузить таблицу" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ ok:false, error:"Недопустимый источник запроса" }, { status:403 });
  const auth = await authorizeManager(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const body = await request.json() as { id?: unknown; action?: unknown };
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const action = typeof body.action === "string" ? body.action.trim() : "";

    if (!id || action !== "activate") {
      return NextResponse.json({ ok: false, error: "Некорректная команда" }, { status: 400 });
    }

    const activated = await withTransaction(async (client) => {
      const current = await client.query<{ id: string; status: string; total_thb:number }>(
        `SELECT id, status, total_thb FROM subscriptions WHERE id = $1 FOR UPDATE`, [id]
      );
      const subscription = current.rows[0];
      if (!subscription) throw new Error("NOT_FOUND");
      if (subscription.status === "ACTIVE") return null;
      if (!["AWAITING_ACTIVATION", "PENDING_PAYMENT"].includes(subscription.status)) throw new Error("WRONG_STATUS");

      const payment = await client.query<{state:string;test:boolean;provider_id:string|null;contract_version:string;total_thb:number}>(`SELECT state,test,provider_id,contract_version,total_thb FROM limenthai_payments WHERE subscription_id=$1 FOR UPDATE`,[id]);
      // Manager activation is independent of provider payment confirmation.
      const code = createSubscriptionCode();
      await client.query(
        `UPDATE subscriptions
         SET status = 'ACTIVE', code = $1, activated_at = now(), paid_at = CASE WHEN $3 THEN COALESCE(paid_at, now()) ELSE paid_at END, updated_at = now()
         WHERE id = $2`, [code, id, !payment.rows[0]]
      );
      await client.query(
        `UPDATE subscription_days SET status = 'AVAILABLE'
         WHERE subscription_id = $1 AND status = 'PLANNED'`, [id]
      );
      await client.query(
        `INSERT INTO manager_events (event_type, entity_id, payload)
         VALUES ('SUBSCRIPTION_ACTIVATED', $1, $2::jsonb)`, [id, JSON.stringify({ code, manual: true, paymentState: payment.rows[0]?.state ?? null, paymentTest: payment.rows[0]?.test ?? null })]
      );
      if (payment.rows[0]) await client.query(`UPDATE limenthai_payments SET activated=true WHERE subscription_id=$1`,[id]);
      return code;
    });

    return NextResponse.json({ ok: true, code: activated });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const message = code === "NOT_FOUND" ? "Подписка не найдена"
      : code === "WRONG_STATUS" ? "Эту подписку нельзя активировать" : "Не удалось активировать подписку";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ ok:false, error:"Недопустимый источник запроса" }, { status:403 });
  const auth = await authorizeManager(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const body = await request.json() as { id?: unknown };
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!id) {
      return NextResponse.json({ ok: false, error: "Не указана подписка" }, { status: 400 });
    }

    const deleted = await withTransaction(async (client) => {
      const current = await client.query<{ id: string; status: string; code: string }>(
        `SELECT id, status, code
         FROM subscriptions
         WHERE id = $1
         FOR UPDATE`,
        [id]
      );

      const subscription = current.rows[0];
      if (!subscription) throw new Error("NOT_FOUND");

      if ((await client.query(`SELECT 1 FROM limenthai_payments WHERE subscription_id=$1`,[id])).rowCount) throw new Error("LIMENTHAI_KEEP_HISTORY");
      // У subscription_scans нет ON DELETE CASCADE, поэтому журнал сканирований
      // удаляется первым. Остальные связанные записи очищаются явно.
      await client.query(`DELETE FROM subscription_scans WHERE subscription_id = $1`, [id]);
      await client.query(`DELETE FROM manager_events WHERE entity_id = $1`, [id]);
      await client.query(`DELETE FROM subscriptions WHERE id = $1`, [id]);

      return { id: subscription.id, code: subscription.code };
    });

    return NextResponse.json({ ok: true, deleted });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const message = code === "NOT_FOUND"
      ? "Подписка не найдена"
      : code === "LIMENTHAI_KEEP_HISTORY" ? "Подписка связана с LimenThai. Удаление запрещено для сохранения истории платежа." : "Не удалось удалить подписку";
    const status = code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
