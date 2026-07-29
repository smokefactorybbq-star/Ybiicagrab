import { NextResponse } from "next/server";
import { withTransaction } from "../../../../lib/db";
import {
  addDaysToIso,
  getBangkokTodayIso,
  hashToken
} from "../../../../lib/subscriptions";
import { notifyManagerTelegram } from "../../../../lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PauseBody = {
  id?: unknown;
  accessToken?: unknown;
  serviceDate?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as PauseBody;
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
    const serviceDate = typeof body.serviceDate === "string" ? body.serviceDate.trim() : "";

    if (!id || !accessToken || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
      return NextResponse.json({ ok: false, error: "Не хватает данных для паузы" }, { status: 400 });
    }

    if (serviceDate < getBangkokTodayIso()) {
      return NextResponse.json({ ok: false, error: "Нельзя поставить на паузу прошедший день" }, { status: 400 });
    }

    const result = await withTransaction(async (client) => {
      const subscriptionResult = await client.query<{
        id: string;
        code: string;
        status: string;
        pause_limit: number;
        pauses_used: number;
        account_access_hash: string | null;
        qr_secret_hash: string;
        pickup_point_name: string | null;
        full_name: string;
        phone: string | null;
      }>(
        `SELECT s.*, u.full_name, u.phone
         FROM subscriptions s
         JOIN users u ON u.id = s.user_id
         WHERE s.id = $1
         FOR UPDATE`,
        [id]
      );

      const subscription = subscriptionResult.rows[0];
      const expectedHash = subscription?.account_access_hash || subscription?.qr_secret_hash;
      if (!subscription || !expectedHash || hashToken(accessToken) !== expectedHash) {
        throw new Error("NOT_FOUND");
      }
      if (subscription.status !== "ACTIVE") throw new Error("NOT_ACTIVE");
      if (subscription.pause_limit < 1) throw new Error("NO_PAUSES");
      if (subscription.pauses_used >= subscription.pause_limit) throw new Error("LIMIT_REACHED");

      const dayResult = await client.query<{ id: string; status: string }>(
        `SELECT id, status FROM subscription_days
         WHERE subscription_id = $1 AND service_date = $2::date
         FOR UPDATE`,
        [id, serviceDate]
      );
      const day = dayResult.rows[0];
      if (!day) throw new Error("DAY_NOT_FOUND");
      if (!["PLANNED", "AVAILABLE"].includes(day.status)) throw new Error("DAY_UNAVAILABLE");

      const lastDateResult = await client.query<{ last_date: string }>(
        `SELECT MAX(service_date)::text AS last_date
         FROM subscription_days
         WHERE subscription_id = $1`,
        [id]
      );
      const lastDate = lastDateResult.rows[0]?.last_date;
      if (!lastDate) throw new Error("DAY_NOT_FOUND");
      const replacementDate = addDaysToIso(lastDate, 1);

      await client.query(
        `UPDATE subscription_days
         SET status = 'PAUSED', pause_requested_at = now()
         WHERE id = $1`,
        [day.id]
      );
      await client.query(
        `INSERT INTO subscription_days (subscription_id, service_date, status)
         VALUES ($1, $2::date, 'AVAILABLE')`,
        [id, replacementDate]
      );
      await client.query(
        `UPDATE subscriptions
         SET pauses_used = pauses_used + 1,
             ends_on = $2::date,
             updated_at = now()
         WHERE id = $1`,
        [id, replacementDate]
      );
      await client.query(
        `INSERT INTO manager_events (event_type, entity_id, payload)
         VALUES ('SUBSCRIPTION_PAUSED', $1, $2::jsonb)`,
        [id, JSON.stringify({
          serviceDate,
          replacementDate,
          fullName: subscription.full_name,
          phone: subscription.phone,
          pickupPointName: subscription.pickup_point_name
        })]
      );

      return { ...subscription, replacementDate };
    });

    void notifyManagerTelegram({
      text: [
        "<b>⏸ Клиент поставил паузу</b>",
        `Имя: ${result.full_name}`,
        `Телефон: ${result.phone || "—"}`,
        `Пункт получения: ${result.pickup_point_name || "—"}`,
        `Дата паузы: ${serviceDate}`,
        `Новый день подписки: ${result.replacementDate}`
      ].join("\n")
    });

    return NextResponse.json({ ok: true, replacementDate: result.replacementDate });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const messages: Record<string, string> = {
      NOT_FOUND: "Подписка не найдена",
      NOT_ACTIVE: "Пауза доступна только для активной подписки",
      NO_PAUSES: "Для этой подписки паузы не предусмотрены",
      LIMIT_REACHED: "Лимит пауз уже использован",
      DAY_NOT_FOUND: "Эта дата не входит в подписку",
      DAY_UNAVAILABLE: "Для этого дня уже нельзя включить паузу"
    };
    return NextResponse.json({ ok: false, error: messages[code] || "Не удалось поставить подписку на паузу" }, { status: 400 });
  }
}
