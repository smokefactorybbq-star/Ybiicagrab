import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAccount } from "../../../lib/auth";
import { withTransaction } from "../../../lib/db";
import { notifyManagerTelegram } from "../../../lib/telegram";
import {
  calculateSubscriptionPrice,
  createAccessToken,
  createPendingCode,
  getPauseLimit,
  hashToken,
  normalizeDates,
  validateConsecutiveDates
} from "../../../lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateSubscriptionBody = {
  dates?: unknown;
  pickupPoint?: unknown;
  paymentMethod?: unknown;
};

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

export async function POST(request: NextRequest) {
  try {
    const account = await getAuthenticatedAccount(request);
    if (!account) return NextResponse.json({ ok: false, error: "Сначала войдите в личный кабинет" }, { status: 401 });
    if (!account.termsAcceptedAt) return NextResponse.json({ ok: false, error: "Сначала примите правила и условия" }, { status: 403 });

    const body = await request.json() as CreateSubscriptionBody;
    const pickupPoint = typeof body.pickupPoint === "string" ? body.pickupPoint.trim() : "";
    const paymentMethod = typeof body.paymentMethod === "string" ? body.paymentMethod.trim() : "";
    const dates = normalizeDates(body.dates);

    if (!pickupPoint) return badRequest("Выберите пункт выдачи");
    if (!paymentMethod) return badRequest("Выберите способ оплаты");
    const dateValidation = validateConsecutiveDates(dates);
    if (!dateValidation.valid) return badRequest(dateValidation.error);

    const { rate, total } = calculateSubscriptionPrice(dates);
    const pauseLimit = getPauseLimit(dates.length);
    const pendingCode = createPendingCode();
    const accountAccess = createAccessToken();
    const accessHash = hashToken(accountAccess);

    const created = await withTransaction(async (client) => {
      const subscription = await client.query<{ id: string }>(
        `INSERT INTO subscriptions (
          code, user_id, status, selected_days, remaining_portions,
          pause_limit, pauses_used, rate_thb, total_thb,
          starts_on, ends_on, qr_secret_hash, account_access_hash,
          pickup_point_name, payment_method, paid_at
        ) VALUES ($1, $2, 'AWAITING_ACTIVATION', $3, $3, $4, 0, $5, $6, $7, $8, $9, $9, $10, $11, now())
        RETURNING id`,
        [pendingCode, account.userId, dates.length, pauseLimit, rate, total, dates[0], dates[dates.length - 1], accessHash, pickupPoint, paymentMethod]
      );
      const subscriptionId = subscription.rows[0].id;
      for (const serviceDate of dates) {
        await client.query(
          `INSERT INTO subscription_days (subscription_id, service_date, status)
           VALUES ($1, $2, 'PLANNED')`,
          [subscriptionId, serviceDate]
        );
      }
      await client.query(
        `INSERT INTO manager_events (event_type, entity_id, payload)
         VALUES ('SUBSCRIPTION_PAID', $1, $2::jsonb)`,
        [subscriptionId, JSON.stringify({
          fullName: account.fullName,
          phone: account.phone,
          dates,
          pickupPoint,
          paymentMethod,
          rate,
          total
        })]
      );
      return subscriptionId;
    });

    void notifyManagerTelegram({
      text: [
        "<b>💳 Новая оплаченная подписка MealPoint</b>",
        `Клиент: ${account.fullName}`,
        `Телефон: ${account.phone}`,
        `Дней: ${dates.length}`,
        `Период: ${dates[0]} — ${dates[dates.length - 1]}`,
        `Пункт: ${pickupPoint}`,
        `Оплата: ${paymentMethod}`,
        `Сумма: ${total} ฿`,
        "Статус: ожидает ручной активации менеджером"
      ].join("\n")
    });

    return NextResponse.json({
      ok: true,
      subscription: {
        id: created,
        selectedDays: dates.length,
        remainingPortions: dates.length,
        pauseLimit,
        rate,
        total,
        dates,
        pickupPoint,
        paymentMethod,
        status: "AWAITING_ACTIVATION"
      }
    }, { status: 201 });
  } catch (error) {
    console.error("Create paid subscription failed", error);
    return NextResponse.json({ ok: false, error: "Не удалось передать оплату менеджеру" }, { status: 500 });
  }
}
