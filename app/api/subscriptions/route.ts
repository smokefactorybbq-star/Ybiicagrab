import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAccount, normalizeContactPhone } from "../../../lib/auth";
import { getAppClock } from "../../../lib/app-time";
import { query, withTransaction } from "../../../lib/db";
import { notifyManagerTelegram } from "../../../lib/telegram";
import { findPickupPoint } from "../../../data/pickupPoints";
import {
  calculateSubscriptionPrice,
  createAccessToken,
  createPendingCode,
  getPauseLimit,
  hashToken,
  normalizeDates,
  validateConsecutiveDates
} from "../../../lib/subscriptions";

import { isSameOriginMutation } from "../../../lib/request-security";
import { paymentMethods, paymentConfiguration } from "../../../lib/payments";
import { validDeliveryTime } from "../../../lib/validation";
import { consumeRateLimit } from "../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateSubscriptionBody = {
  dates?: unknown;
  paymentMethod?: unknown;
  fulfillmentType?: unknown;
  customerName?: unknown;
  phone?: unknown;
  address?: unknown;
  requestedTime?: unknown;
  pickupPointName?: unknown;
  checkoutKey?: unknown;
};

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char] || char));
}

function validTime(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [h,m] = value.split(":").map(Number);
  const n=h*60+m;
  return n >= 12*60 && n <= 18*60;
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ok:false,error:"Недопустимый источник запроса"},{status:403});
  try {
    const account = await getAuthenticatedAccount(request);
    if (!account) return NextResponse.json({ ok: false, error: "Для оформления подписки войдите через Telegram" }, { status: 401 });
    if (!account.termsAcceptedAt) return NextResponse.json({ ok: false, error: "Сначала примите правила и условия" }, { status: 403 });

    const body = await request.json() as CreateSubscriptionBody;
    const paymentMethod = typeof body.paymentMethod === "string" ? body.paymentMethod.trim() : "";
    const dates = normalizeDates(body.dates);
    const fulfillmentType = body.fulfillmentType === "DELIVERY" ? "DELIVERY" : "PICKUP";
    const customerName = account.fullName.trim();
    const phoneInput = account.phone;
    const phone = normalizeContactPhone(phoneInput);
    const address = typeof body.address === "string" ? body.address.trim() : "";
    const requestedTime = fulfillmentType === "DELIVERY" && typeof body.requestedTime === "string" ? body.requestedTime.trim() : null;
    const pickupPointName = typeof body.pickupPointName === "string" ? body.pickupPointName.trim() : "";

    if (!paymentMethods.includes(paymentMethod as typeof paymentMethods[number])) return badRequest("Выберите способ оплаты");
    const config = paymentConfiguration();
    if (paymentMethod === "PROMPTPAY" && !config.thaiQr) return badRequest("QR тайского банка ещё не настроен. Свяжитесь с менеджером.");
    if (paymentMethod === "BANK_RU" && (!config.russianQr || !config.rubRate)) return badRequest("QR банка РФ или курс ещё не настроен. Свяжитесь с менеджером.");
    const checkoutKey = typeof body.checkoutKey === "string" && /^[a-zA-Z0-9-]{16,80}$/.test(body.checkoutKey) ? body.checkoutKey : "";
    if (!checkoutKey) return badRequest("Обновите страницу оформления");
    const rateLimit = await consumeRateLimit(`checkout:${account.userId}`,20,3600);
    if (!rateLimit.allowed) return NextResponse.json({ok:false,error:"Слишком много попыток оформления"},{status:429});
    if (customerName.length < 2) return badRequest("Введите имя");
    if (phone.length < 8) return badRequest("Введите корректный телефон");
    if (fulfillmentType === "DELIVERY" && !validDeliveryTime(requestedTime || "")) return badRequest("Выберите время с 12:00 до 18:00");
    if (fulfillmentType === "DELIVERY" && (address.length < 5 || address.length > 1000)) return badRequest("Введите адрес доставки");
    if (fulfillmentType === "PICKUP" && !findPickupPoint(pickupPointName)) return badRequest("Выберите пункт самовывоза");

    const clock = await getAppClock();
    const dateValidation = validateConsecutiveDates(dates, clock.date);
    if (!dateValidation.valid) return badRequest(dateValidation.error);

    const { rate, total } = calculateSubscriptionPrice(dates);
    const pauseLimit = getPauseLimit(dates.length);
    const pendingCode = createPendingCode();
    const accountAccess = createAccessToken();
    const accessHash = hashToken(accountAccess);
    const pickupPoint = fulfillmentType === "PICKUP" ? pickupPointName : null;

    const created = await withTransaction(async (client) => {
      await client.query(`SELECT id FROM users WHERE id=$1 FOR UPDATE`,[account.userId]);
      const existing = await client.query<{id:string}>(`SELECT id::text FROM subscriptions WHERE user_id=$1 AND checkout_key=$2`,[account.userId,checkoutKey]);
      if (existing.rows[0]) return existing.rows[0].id;
      const subscription = await client.query<{ id: string }>(
        `INSERT INTO subscriptions (
          code, user_id, status, selected_days, remaining_portions,
          pause_limit, pauses_used, rate_thb, total_thb,
          starts_on, ends_on, qr_secret_hash, account_access_hash,
          pickup_point_name, payment_method, paid_at,
          fulfillment_type, customer_name, customer_phone, delivery_address, default_time, checkout_key, rub_rate
        ) VALUES ($1,$2,'AWAITING_ACTIVATION',$3,$3,$4,0,$5,$6,$7,$8,$9,$9,$10,$11,NULL,$12,$13,$14,$15,$16,$17,$18)
        RETURNING id::text`,
        [pendingCode,account.userId,dates.length,pauseLimit,rate,total,dates[0],dates[dates.length-1],accessHash,pickupPoint,paymentMethod,
         fulfillmentType,customerName,phone,fulfillmentType === "DELIVERY" ? address : null,requestedTime,checkoutKey,paymentMethod === "BANK_RU" ? config.rubRate : null]
      );
      const subscriptionId = subscription.rows[0].id;
      for (const serviceDate of dates) {
        await client.query(
          `INSERT INTO subscription_days (
             subscription_id,service_date,status,fulfillment_type,requested_time,customer_name,customer_phone,delivery_address
           ) VALUES ($1,$2,'PLANNED',$3,$4,$5,$6,$7)`,
          [subscriptionId,serviceDate,fulfillmentType,requestedTime,customerName,phone,fulfillmentType === "DELIVERY" ? address : null]
        );
      }
      await client.query(
        `INSERT INTO manager_events (event_type,entity_id,payload)
         VALUES ('SUBSCRIPTION_CREATED',$1,$2::jsonb)`,
        [subscriptionId, JSON.stringify({fullName:customerName,phone,dates,pickupPoint,paymentMethod,rate,total,fulfillmentType,address:fulfillmentType === "DELIVERY" ? address : null,requestedTime})]
      );
      return subscriptionId;
    });

    void notifyManagerTelegram({ text: [
      "<b>💳 Новая подписка — ожидает оплаты MealPoint</b>",
      `Клиент: ${escapeHtml(customerName)}`,
      `Телефон: ${escapeHtml(phone)}`,
      `Дней: ${dates.length}`,
      `Период: ${dates[0]} — ${dates[dates.length-1]}`,
      `Получение: ${fulfillmentType === "DELIVERY" ? "доставка" : "самовывоз"}`,
      fulfillmentType === "DELIVERY" ? `Адрес: ${escapeHtml(address)}` : "",
      requestedTime ? `Время доставки: ${requestedTime}` : "",
      `Оплата подписки: ${escapeHtml(paymentMethod)}`,
      `Сумма: ${total} ฿`,
      "Статус: ожидает ручной активации менеджером"
    ].filter(Boolean).join("\n") });

    const savedResult=await query<{total_thb:number;rate_thb:number;payment_method:string;rub_rate:string|null}>(`SELECT total_thb,rate_thb,payment_method,rub_rate FROM subscriptions WHERE id=$1 AND user_id=$2`,[created,account.userId]);
    const saved=savedResult.rows[0];
    return NextResponse.json({
      ok:true,
      subscription:{id:created,selectedDays:dates.length,remainingPortions:dates.length,pauseLimit,rate:saved.rate_thb,total:saved.total_thb,dates,pickupPoint,paymentMethod:saved.payment_method,status:"AWAITING_ACTIVATION",fulfillmentType,requestedTime,rubRate:saved.rub_rate?Number(saved.rub_rate):null}
    }, {status:201});
  } catch (error) {
    console.error("Create paid subscription failed", error);
    return NextResponse.json({ok:false,error:"Не удалось оформить подписку"},{status:500});
  }
}
