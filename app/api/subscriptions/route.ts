import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAccount } from "../../../lib/auth";
import { getAppClock } from "../../../lib/app-time";
import { withTransaction } from "../../../lib/db";
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
  try {
    const account = await getAuthenticatedAccount(request);
    if (!account) return NextResponse.json({ ok: false, error: "Для оформления подписки войдите по номеру телефона" }, { status: 401 });
    if (!account.termsAcceptedAt) return NextResponse.json({ ok: false, error: "Сначала примите правила и условия" }, { status: 403 });

    const body = await request.json() as CreateSubscriptionBody;
    const paymentMethod = typeof body.paymentMethod === "string" ? body.paymentMethod.trim() : "";
    const dates = normalizeDates(body.dates);
    const fulfillmentType = body.fulfillmentType === "DELIVERY" ? "DELIVERY" : "PICKUP";
    const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
    const phone = account.phone;
    const address = typeof body.address === "string" ? body.address.trim() : "";
    const requestedTime = typeof body.requestedTime === "string" ? body.requestedTime.trim() : "";
    const pickupPointName = typeof body.pickupPointName === "string" ? body.pickupPointName.trim() : "";

    if (!paymentMethod) return badRequest("Выберите способ оплаты");
    if (customerName.length < 2) return badRequest("Введите имя");
    if (phone.length < 8) return badRequest("Введите корректный телефон");
    if (!validTime(requestedTime)) return badRequest("Выберите время с 12:00 до 18:00");
    if (fulfillmentType === "DELIVERY" && address.length < 5) return badRequest("Введите адрес доставки");
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
      await client.query(
        `UPDATE users SET profile_name=$2, full_name=$2, phone=$3,
           address=CASE WHEN $4<>'' THEN $4 ELSE address END, updated_at=now()
         WHERE id=$1`,
        [account.userId, customerName, phone, address]
      );
      await client.query(
        `INSERT INTO customer_accounts (user_id,phone,password_hash) VALUES ($1,$2,'')
         ON CONFLICT (user_id) DO UPDATE SET phone=EXCLUDED.phone,updated_at=now()`,
        [account.userId, phone]
      );

      const subscription = await client.query<{ id: string }>(
        `INSERT INTO subscriptions (
          code, user_id, status, selected_days, remaining_portions,
          pause_limit, pauses_used, rate_thb, total_thb,
          starts_on, ends_on, qr_secret_hash, account_access_hash,
          pickup_point_name, payment_method, paid_at,
          fulfillment_type, customer_name, customer_phone, delivery_address, default_time
        ) VALUES ($1,$2,'AWAITING_ACTIVATION',$3,$3,$4,0,$5,$6,$7,$8,$9,$9,$10,$11,now(),$12,$13,$14,$15,$16)
        RETURNING id::text`,
        [pendingCode,account.userId,dates.length,pauseLimit,rate,total,dates[0],dates[dates.length-1],accessHash,pickupPoint,paymentMethod,
         fulfillmentType,customerName,phone,fulfillmentType === "DELIVERY" ? address : null,requestedTime]
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
         VALUES ('SUBSCRIPTION_PAID',$1,$2::jsonb)`,
        [subscriptionId, JSON.stringify({fullName:customerName,phone,dates,pickupPoint,paymentMethod,rate,total,fulfillmentType,address:fulfillmentType === "DELIVERY" ? address : null,requestedTime})]
      );
      return subscriptionId;
    });

    void notifyManagerTelegram({ text: [
      "<b>💳 Новая оплаченная подписка MealPoint</b>",
      `Клиент: ${escapeHtml(customerName)}`,
      `Телефон: ${escapeHtml(phone)}`,
      `Дней: ${dates.length}`,
      `Период: ${dates[0]} — ${dates[dates.length-1]}`,
      `Получение: ${fulfillmentType === "DELIVERY" ? "доставка" : "самовывоз"}`,
      fulfillmentType === "DELIVERY" ? `Адрес: ${escapeHtml(address)}` : "",
      `Время: ${requestedTime}`,
      `Оплата подписки: ${escapeHtml(paymentMethod)}`,
      `Сумма: ${total} ฿`,
      "Статус: ожидает ручной активации менеджером"
    ].filter(Boolean).join("\n") });

    return NextResponse.json({
      ok:true,
      subscription:{id:created,selectedDays:dates.length,remainingPortions:dates.length,pauseLimit,rate,total,dates,pickupPoint,paymentMethod,status:"AWAITING_ACTIVATION",fulfillmentType,requestedTime}
    }, {status:201});
  } catch (error) {
    console.error("Create paid subscription failed", error);
    return NextResponse.json({ok:false,error:"Не удалось передать оплату менеджеру"},{status:500});
  }
}
