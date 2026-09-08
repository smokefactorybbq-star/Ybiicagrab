import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAccount } from "../../../lib/auth";
import { getAppClock } from "../../../lib/app-time";
import { withTransaction } from "../../../lib/db";
import { notifyManagerTelegram } from "../../../lib/telegram";
import { notifyBotSubscription } from "../../../lib/tgfoodbot";
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

type CreateSubscriptionBody = { dates?: unknown; pickupPoint?: unknown; paymentMethod?: unknown };

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
    const paymentMethod = String(body.paymentMethod || "").trim().toUpperCase();
    const dates = normalizeDates(body.dates);
    if (!pickupPoint) return badRequest("Выберите пункт выдачи");
    if (!(["PROMPTPAY", "CASH"] as const).includes(paymentMethod as "PROMPTPAY" | "CASH")) return badRequest("Выберите PromptPay или Cash");

    const clock = await getAppClock();
    const dateValidation = validateConsecutiveDates(dates, clock.date);
    if (!dateValidation.valid) return badRequest(dateValidation.error);

    const { rate, total } = calculateSubscriptionPrice(dates);
    const pauseLimit = getPauseLimit(dates.length);
    const pendingCode = createPendingCode();
    const accountAccess = createAccessToken();
    const accessHash = hashToken(accountAccess);

    const created = await withTransaction(async (client) => {
      const subscription = await client.query<{ id: string }>(
        `INSERT INTO subscriptions (
          code,user_id,status,selected_days,remaining_portions,pause_limit,pauses_used,rate_thb,total_thb,
          starts_on,ends_on,qr_secret_hash,account_access_hash,pickup_point_name,payment_method,paid_at
        ) VALUES ($1,$2,'AWAITING_ACTIVATION',$3,$3,$4,0,$5,$6,$7,$8,$9,$9,$10,$11,$12)
        RETURNING id::text`,
        [pendingCode, account.userId, dates.length, pauseLimit, rate, total, dates[0], dates[dates.length - 1], accessHash,
          pickupPoint, paymentMethod, null]
      );
      const subscriptionId = subscription.rows[0].id;
      for (const serviceDate of dates) {
        await client.query(
          `INSERT INTO subscription_days (subscription_id,service_date,status) VALUES ($1,$2,'PLANNED')`,
          [subscriptionId, serviceDate]
        );
      }
      await client.query(
        `INSERT INTO manager_events (event_type,entity_id,payload) VALUES ('SUBSCRIPTION_REQUESTED',$1,$2::jsonb)`,
        [subscriptionId, JSON.stringify({ fullName: account.fullName, phone: account.phone, dates, pickupPoint, paymentMethod, rate, total })]
      );
      return subscriptionId;
    });

    const message = paymentMethod === "CASH"
      ? "Клиент выбрал Cash. Свяжитесь с клиентом для согласования оплаты."
      : "Клиент нажал «Я оплатил». Подписку активировать только после получения и проверки чека.";

    try {
      await notifyBotSubscription({
        subscription_id: created,
        subscription_code: pendingCode,
        client_name: account.fullName,
        client_phone: account.phone,
        dates,
        pickup_point: pickupPoint,
        payment_method: paymentMethod,
        rate,
        total,
        manager_instruction: message,
      });
    } catch (error) {
      console.error("MealPoint bot notification failed", error);
      void notifyManagerTelegram({ text: [
        `<b>🥗 Новая подписка MealPoint</b>`,
        `Клиент: ${account.fullName}`,
        `Телефон: ${account.phone}`,
        `Дней: ${dates.length}`,
        `Период: ${dates[0]} — ${dates[dates.length - 1]}`,
        `Пункт: ${pickupPoint}`,
        `Оплата: ${paymentMethod}`,
        `Сумма: ${total} ฿`,
        message,
      ].join("\n") });
    }

    return NextResponse.json({
      ok: true,
      subscription: { id: created, selectedDays: dates.length, remainingPortions: dates.length, pauseLimit, rate, total, dates, pickupPoint, paymentMethod, status: "AWAITING_ACTIVATION" }
    }, { status: 201 });
  } catch (error) {
    console.error("Create subscription failed", error);
    return NextResponse.json({ ok: false, error: "Не удалось оформить подписку" }, { status: 500 });
  }
}
