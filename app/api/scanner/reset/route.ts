import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { withTransaction } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResetBody = {
  subscriptionId?: unknown;
  serviceDate?: unknown;
  deviceId?: unknown;
  pickupPointName?: unknown;
};

function authorize(request: Request) {
  const expected = process.env.SCANNER_API_KEY || process.env.MANAGER_PASSWORD;
  const supplied = request.headers.get("x-scanner-key") || "";
  if (!expected || supplied !== expected) return false;
  return process.env.SCANNER_TEST_MODE === "true";
}

export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: "Сброс разрешён только при SCANNER_TEST_MODE=true" }, { status: 403 });
  }

  try {
    const body = await request.json() as ResetBody;
    const subscriptionId = typeof body.subscriptionId === "string" ? body.subscriptionId.trim() : "";
    const serviceDate = typeof body.serviceDate === "string" ? body.serviceDate.trim() : "";
    const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim().slice(0, 100) : "Test scanner";
    const pickupPointName = typeof body.pickupPointName === "string" ? body.pickupPointName.trim().slice(0, 160) : "Test point";

    if (!subscriptionId || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
      return NextResponse.json({ ok: false, error: "Не хватает данных тестового списания" }, { status: 400 });
    }

    const result = await withTransaction(async (client) => {
      const subscriptionResult = await client.query<{
        id: string;
        status: string;
        remaining_portions: number;
        selected_days: number;
        code: string;
      }>(
        `SELECT id, status, remaining_portions, selected_days, code
         FROM subscriptions WHERE id = $1 FOR UPDATE`,
        [subscriptionId]
      );
      const subscription = subscriptionResult.rows[0];
      if (!subscription) throw new Error("NOT_FOUND");

      const dayResult = await client.query<{ id: string; status: string }>(
        `SELECT id, status FROM subscription_days
         WHERE subscription_id = $1 AND service_date = $2::date
         FOR UPDATE`,
        [subscriptionId, serviceDate]
      );
      const day = dayResult.rows[0];
      if (!day) throw new Error("DAY_NOT_FOUND");
      if (day.status !== "REDEEMED") throw new Error("NOT_REDEEMED");

      const remainingAfter = Math.min(subscription.selected_days, subscription.remaining_portions + 1);

      await client.query(
        `UPDATE subscription_days
         SET status = 'AVAILABLE', redeemed_at = NULL
         WHERE id = $1`,
        [day.id]
      );
      await client.query(
        `UPDATE subscriptions
         SET remaining_portions = $1,
             status = CASE WHEN status = 'COMPLETED' THEN 'ACTIVE'::subscription_status ELSE status END,
             updated_at = now()
         WHERE id = $2`,
        [remainingAfter, subscriptionId]
      );
      await client.query(
        `INSERT INTO subscription_scans (
           subscription_id, subscription_day_id, pickup_point_id,
           device_id, token_nonce, result, pickup_point_name, portions_after
         ) VALUES ($1, $2, NULL, $3, $4, 'TEST_RESET', $5, $6)`,
        [subscriptionId, day.id, deviceId, randomUUID(), pickupPointName, remainingAfter]
      );
      await client.query(
        `INSERT INTO manager_events (event_type, entity_id, payload)
         VALUES ('SUBSCRIPTION_TEST_RESET', $1, $2::jsonb)`,
        [subscriptionId, JSON.stringify({ serviceDate, code: subscription.code, remainingPortions: remainingAfter })]
      );

      return { remainingPortions: remainingAfter, code: subscription.code };
    });

    return NextResponse.json({ ok: true, result: "TEST_RESET", message: "Тестовое списание отменено", ...result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const messages: Record<string, string> = {
      NOT_FOUND: "Подписка не найдена",
      DAY_NOT_FOUND: "Дата не входит в подписку",
      NOT_REDEEMED: "Эта дата не была списана"
    };
    return NextResponse.json({ ok: false, error: messages[code] || "Не удалось отменить тестовое списание" }, { status: 400 });
  }
}
