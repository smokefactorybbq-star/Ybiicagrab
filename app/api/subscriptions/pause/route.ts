import { NextResponse } from "next/server";
import { withTransaction } from "../../../../lib/db";
import { hashToken } from "../../../../lib/subscriptions";
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

    if (!id || !accessToken || !serviceDate) {
      return NextResponse.json({ ok: false, error: "Не хватает данных для паузы" }, { status: 400 });
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

      await client.query(
        `UPDATE subscription_days
         SET status = 'PAUSE_REQUESTED', pause_requested_at = now()
         WHERE id = $1`,
        [day.id]
      );
      await client.query(
        `UPDATE subscriptions SET pauses_used = pauses_used + 1, updated_at = now() WHERE id = $1`,
        [id]
      );
      await client.query(
        `INSERT INTO manager_events (event_type, entity_id, payload)
         VALUES ('SUBSCRIPTION_PAUSE_REQUESTED', $1, $2::jsonb)`,
        [id, JSON.stringify({ serviceDate, fullName: subscription.full_name, phone: subscription.phone })]
      );

      return subscription;
    });

    void notifyManagerTelegram({
      text: [
        "<b>⏸ Запрос паузы MealPoint</b>",
        `Клиент: ${result.full_name}`,
        `Телефон: ${result.phone || "—"}`,
        `Дата паузы: ${serviceDate}`
      ].join("\n")
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const messages: Record<string, string> = {
      NOT_FOUND: "Подписка не найдена",
      NOT_ACTIVE: "Пауза доступна только для активной подписки",
      NO_PAUSES: "Для этой подписки паузы не предусмотрены",
      LIMIT_REACHED: "Лимит пауз уже использован",
      DAY_NOT_FOUND: "Эта дата не входит в подписку",
      DAY_UNAVAILABLE: "Для этого дня уже нельзя запросить паузу"
    };
    return NextResponse.json({ ok: false, error: messages[code] || "Не удалось запросить паузу" }, { status: 400 });
  }
}
