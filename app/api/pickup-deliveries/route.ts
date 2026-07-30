import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAccount } from "../../../lib/auth";
import { query, withTransaction } from "../../../lib/db";
import { notifyManagerTelegram } from "../../../lib/telegram";
import { getBangkokTodayIso, normalizePhone } from "../../../lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


function getBangkokHour() {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date()).find((part) => part.type === "hour")?.value;
  return Number(hour || "0");
}

function botUrl(token: string) {
  const username = (process.env.TELEGRAM_BOT_USERNAME || "").replace(/^@/, "").trim();
  return username ? `https://t.me/${username}?start=delivery_${token}` : "";
}

export async function GET(request: NextRequest) {
  const account = await getAuthenticatedAccount(request);
  if (!account) return NextResponse.json({ ok: false, error: "Требуется вход" }, { status: 401 });

  const result = await query(
    `SELECT id, subscription_id, service_date::text, pickup_point_name,
            customer_name, customer_phone, delivery_address, delivery_type,
            requested_time, status, created_at
     FROM pickup_delivery_requests
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [account.userId]
  );
  return NextResponse.json({ ok: true, requests: result.rows }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  try {
    const account = await getAuthenticatedAccount(request);
    if (!account) return NextResponse.json({ ok: false, error: "Требуется вход" }, { status: 401 });

    const body = await request.json() as {
      subscriptionId?: unknown; serviceDate?: unknown; customerName?: unknown; phone?: unknown;
      address?: unknown; deliveryType?: unknown; requestedTime?: unknown;
    };
    const subscriptionId = typeof body.subscriptionId === "string" ? body.subscriptionId.trim() : "";
    const serviceDate = typeof body.serviceDate === "string" ? body.serviceDate.trim() : "";
    const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
    const phone = normalizePhone(typeof body.phone === "string" ? body.phone : "");
    const address = typeof body.address === "string" ? body.address.trim() : "";
    const deliveryType = body.deliveryType === "SCHEDULED" ? "SCHEDULED" : "ASAP";
    const requestedTime = deliveryType === "SCHEDULED" && typeof body.requestedTime === "string" ? body.requestedTime.trim() : null;

    if (!subscriptionId || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) return NextResponse.json({ ok: false, error: "Не выбрана подписка или дата" }, { status: 400 });
    if (customerName.length < 2 || phone.length < 8 || address.length < 5) return NextResponse.json({ ok: false, error: "Заполните имя, телефон и адрес" }, { status: 400 });
    if (serviceDate !== getBangkokTodayIso()) return NextResponse.json({ ok: false, error: "Доставку из ПВ можно заказать только на сегодняшний обед" }, { status: 400 });
    if (getBangkokHour() < 12) return NextResponse.json({ ok: false, error: "Заказать доставку из ПВ можно после 12:00 по времени Пхукета" }, { status: 400 });
    if (deliveryType === "SCHEDULED" && !/^\d{2}:\d{2}$/.test(requestedTime || "")) return NextResponse.json({ ok: false, error: "Выберите время доставки" }, { status: 400 });

    const token = randomBytes(18).toString("base64url");
    const created = await withTransaction(async (client) => {
      const subscriptionResult = await client.query<{
        id: string; pickup_point_name: string | null; status: string; day_status: string;
      }>(
        `SELECT s.id, s.pickup_point_name, s.status, sd.status AS day_status
         FROM subscriptions s
         JOIN subscription_days sd ON sd.subscription_id = s.id AND sd.service_date = $3::date
         WHERE s.id = $1 AND s.user_id = $2
         FOR UPDATE`,
        [subscriptionId, account.userId, serviceDate]
      );
      const subscription = subscriptionResult.rows[0];
      if (!subscription) throw new Error("NOT_FOUND");
      if (subscription.status !== "ACTIVE") throw new Error("NOT_ACTIVE");
      if (!["AVAILABLE", "PLANNED"].includes(subscription.day_status)) throw new Error("DAY_UNAVAILABLE");

      const insert = await client.query<{ id: string }>(
        `INSERT INTO pickup_delivery_requests (
           public_token, user_id, subscription_id, service_date, pickup_point_name,
           customer_name, customer_phone, delivery_address, delivery_type, requested_time
         ) VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (subscription_id, service_date)
         DO UPDATE SET customer_name = EXCLUDED.customer_name,
                       customer_phone = EXCLUDED.customer_phone,
                       delivery_address = EXCLUDED.delivery_address,
                       delivery_type = EXCLUDED.delivery_type,
                       requested_time = EXCLUDED.requested_time,
                       public_token = EXCLUDED.public_token,
                       status = 'NEW',
                       updated_at = now()
         RETURNING id`,
        [token, account.userId, subscriptionId, serviceDate, subscription.pickup_point_name || "MealPoint", customerName, phone, address, deliveryType, requestedTime]
      );

      await client.query(
        `INSERT INTO manager_events (event_type, entity_id, payload)
         VALUES ('PICKUP_DELIVERY_REQUEST', $1, $2::jsonb)`,
        [insert.rows[0].id, JSON.stringify({ customerName, phone, address, deliveryType, requestedTime, pickupPointName: subscription.pickup_point_name, serviceDate })]
      );
      return { id: insert.rows[0].id, pickupPointName: subscription.pickup_point_name || "MealPoint" };
    });

    void notifyManagerTelegram({
      text: [
        "<b>🚕 Доставка обеда из ПВ</b>",
        `Клиент: ${customerName}`,
        `Телефон: ${phone}`,
        `Адрес: ${address}`,
        `Пункт выдачи: ${created.pickupPointName}`,
        `Дата: ${serviceDate}`,
        `Время: ${deliveryType === "ASAP" ? "Ближайшее" : requestedTime}`,
        "Оплату доставки клиент производит по тарифу Grab Taxi."
      ].join("\n")
    });

    return NextResponse.json({
      ok: true,
      requestId: created.id,
      telegramUrl: botUrl(token),
      message: "Заявка сохранена и передана менеджеру"
    }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const messages: Record<string, string> = {
      NOT_FOUND: "Подписка или сегодняшний обед не найдены",
      NOT_ACTIVE: "Подписка не активна",
      DAY_UNAVAILABLE: "Этот обед уже получен, поставлен на паузу или недоступен"
    };
    console.error("Pickup delivery request failed", error);
    return NextResponse.json({ ok: false, error: messages[code] || "Не удалось оформить доставку" }, { status: 400 });
  }
}
