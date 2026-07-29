import { NextResponse } from "next/server";
import { query, withTransaction } from "../../../lib/db";
import { notifyManagerTelegram } from "../../../lib/telegram";
import {
  calculateSubscriptionPrice,
  createAccessToken,
  createPendingCode,
  getPauseLimit,
  hashToken,
  normalizeDates,
  normalizePhone,
  validateConsecutiveDates
} from "../../../lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateSubscriptionBody = {
  fullName?: unknown;
  phone?: unknown;
  dates?: unknown;
  pickupPoint?: unknown;
  paymentMethod?: unknown;
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
  service_date: string;
  status: string;
};

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

function toIsoDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || "";
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as CreateSubscriptionBody;
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const phone = typeof body.phone === "string" ? normalizePhone(body.phone) : "";
    const pickupPoint = typeof body.pickupPoint === "string" ? body.pickupPoint.trim() : "";
    const paymentMethod = typeof body.paymentMethod === "string" ? body.paymentMethod.trim() : "";
    const dates = normalizeDates(body.dates);

    if (fullName.length < 2) return badRequest("Укажите имя");
    if (phone.length < 8) return badRequest("Укажите корректный номер телефона");
    if (!pickupPoint) return badRequest("Выберите пункт выдачи");
    if (!paymentMethod) return badRequest("Выберите способ оплаты");

    const dateValidation = validateConsecutiveDates(dates);
    if (!dateValidation.valid) return badRequest(dateValidation.error);

    const { rate, total } = calculateSubscriptionPrice(dates);
    const pauseLimit = getPauseLimit(dates.length);
    const pendingCode = createPendingCode();
    const accessToken = createAccessToken();
    const accessHash = hashToken(accessToken);

    const created = await withTransaction(async (client) => {
      const existingUser = await client.query<{ id: string }>(
        `SELECT id FROM users WHERE phone = $1 ORDER BY created_at ASC LIMIT 1`,
        [phone]
      );

      let userId = existingUser.rows[0]?.id;

      if (userId) {
        await client.query(
          `UPDATE users SET full_name = $1, updated_at = now() WHERE id = $2`,
          [fullName, userId]
        );
      } else {
        const insertedUser = await client.query<{ id: string }>(
          `INSERT INTO users (full_name, phone) VALUES ($1, $2) RETURNING id`,
          [fullName, phone]
        );
        userId = insertedUser.rows[0].id;
      }

      const subscription = await client.query<{ id: string }>(
        `INSERT INTO subscriptions (
          code, user_id, status, selected_days, remaining_portions,
          pause_limit, pauses_used, rate_thb, total_thb,
          starts_on, ends_on, qr_secret_hash, account_access_hash,
          pickup_point_name, payment_method, paid_at
        ) VALUES ($1, $2, 'AWAITING_ACTIVATION', $3, $3, $4, 0, $5, $6, $7, $8, $9, $9, $10, $11, now())
        RETURNING id`,
        [pendingCode, userId, dates.length, pauseLimit, rate, total, dates[0], dates[dates.length - 1], accessHash, pickupPoint, paymentMethod]
      );

      const subscriptionId = subscription.rows[0].id;

      for (const serviceDate of dates) {
        await client.query(
          `INSERT INTO subscription_days (subscription_id, service_date, status)
           VALUES ($1, $2, 'PLANNED')`,
          [subscriptionId, serviceDate]
        );
      }

      const eventPayload = { fullName, phone, dates, pickupPoint, paymentMethod, rate, total };
      await client.query(
        `INSERT INTO manager_events (event_type, entity_id, payload)
         VALUES ('SUBSCRIPTION_PAID', $1, $2::jsonb)`,
        [subscriptionId, JSON.stringify(eventPayload)]
      );

      return subscriptionId;
    });

    void notifyManagerTelegram({
      text: [
        "<b>💳 Новая оплаченная подписка MealPoint</b>",
        `Клиент: ${fullName}`,
        `Телефон: ${phone}`,
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
        accessToken,
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
    const message = error instanceof Error && error.message.includes("DATABASE_URL")
      ? "База данных ещё не подключена к сайту"
      : "Не удалось передать оплату менеджеру";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim() || "";
    const accessToken = url.searchParams.get("accessToken")?.trim() || "";
    const legacyCode = url.searchParams.get("code")?.trim() || "";
    const legacyToken = url.searchParams.get("token")?.trim() || "";
    const token = accessToken || legacyToken;

    if ((!id && !legacyCode) || !token) return badRequest("Не указаны данные личного кабинета");

    const subscriptionResult = await query<SubscriptionRow>(
      `SELECT s.*, u.full_name, u.phone
       FROM subscriptions s
       JOIN users u ON u.id = s.user_id
       WHERE ${id ? "s.id = $1" : "s.code = $1"}
       LIMIT 1`,
      [id || legacyCode]
    );

    const subscription = subscriptionResult.rows[0];
    const expectedHash = subscription?.account_access_hash || subscription?.qr_secret_hash;
    if (!subscription || !expectedHash || hashToken(token) !== expectedHash) {
      return NextResponse.json({ ok: false, error: "Подписка не найдена" }, { status: 404 });
    }

    const daysResult = await query<SubscriptionDayRow>(
      `SELECT service_date::text, status
       FROM subscription_days
       WHERE subscription_id = $1
       ORDER BY service_date ASC`,
      [subscription.id]
    );

    const {
      account_access_hash: _access,
      qr_secret_hash: _qr,
      ...safeSubscription
    } = subscription;

    return NextResponse.json({
      ok: true,
      subscription: {
        ...safeSubscription,
        starts_on: toIsoDate(subscription.starts_on),
        ends_on: toIsoDate(subscription.ends_on),
        code: subscription.status === "ACTIVE" ? subscription.code : null,
        qrEnabled: subscription.status === "ACTIVE",
        days: daysResult.rows.map((day) => ({
          ...day,
          service_date: toIsoDate(day.service_date)
        }))
      }
    });
  } catch (error) {
    console.error("Read subscription failed", error);
    return NextResponse.json({ ok: false, error: "Не удалось загрузить подписку" }, { status: 500 });
  }
}
