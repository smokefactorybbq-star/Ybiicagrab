import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAccount } from "../../../../lib/auth";
import { getAppClock } from "../../../../lib/app-time";
import { withTransaction } from "../../../../lib/db";
import { processSubscriptionDayClosures } from "../../../../lib/subscription-maintenance";
import { isSameOriginMutation } from "../../../../lib/request-security";
import { isUuid, validDate, validDeliveryTime } from "../../../../lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FulfillmentType = "PICKUP" | "DELIVERY";

export async function PATCH(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ ok: false, error: "Недопустимый источник запроса" }, { status: 403 });
  }

  await processSubscriptionDayClosures();
  const account = await getAuthenticatedAccount(request);
  if (!account) return NextResponse.json({ ok: false, error: "Требуется вход" }, { status: 401 });

  const body = await request.json() as {
    subscriptionId?: unknown;
    serviceDate?: unknown;
    fulfillmentType?: unknown;
    pickupPointCode?: unknown;
    requestedTime?: unknown;
    deliveryAddress?: unknown;
  };

  const subscriptionId = typeof body.subscriptionId === "string" ? body.subscriptionId.trim() : "";
  const serviceDate = typeof body.serviceDate === "string" ? body.serviceDate.trim() : "";
  const fulfillmentType: FulfillmentType | "" = body.fulfillmentType === "PICKUP" || body.fulfillmentType === "DELIVERY" ? body.fulfillmentType : "";
  const pickupPointCode = typeof body.pickupPointCode === "string" ? body.pickupPointCode.trim() : "";
  const requestedTime = typeof body.requestedTime === "string" ? body.requestedTime.trim() : "";
  const deliveryAddress = typeof body.deliveryAddress === "string" ? body.deliveryAddress.trim() : "";

  if (!isUuid(subscriptionId) || !validDate(serviceDate) || !fulfillmentType) {
    return NextResponse.json({ ok: false, error: "Некорректные данные способа получения" }, { status: 400 });
  }

  const clock = await getAppClock();
  if (serviceDate < clock.date) {
    return NextResponse.json({ ok: false, error: "Нельзя изменить способ получения прошедшего дня" }, { status: 400 });
  }
  if (serviceDate === clock.date && clock.hour >= 11) {
    return NextResponse.json({ ok: false, error: "После 11:00 способ получения на сегодня изменить нельзя" }, { status: 409 });
  }
  if (fulfillmentType === "DELIVERY") {
    if (!validDeliveryTime(requestedTime)) {
      return NextResponse.json({ ok: false, error: "Выберите время доставки с 13:30 до 18:00" }, { status: 400 });
    }
    if (deliveryAddress.length < 5 || deliveryAddress.length > 1000) {
      return NextResponse.json({ ok: false, error: "Укажите адрес доставки в профиле" }, { status: 400 });
    }
  }
  if (fulfillmentType === "PICKUP" && !pickupPointCode) {
    return NextResponse.json({ ok: false, error: "Выберите точку самовывоза" }, { status: 400 });
  }

  try {
    const result = await withTransaction(async (client) => {
      const current = await client.query<{ id: string; status: string }>(
        `SELECT sd.id::text, sd.status::text
         FROM subscription_days sd
         JOIN subscriptions s ON s.id=sd.subscription_id
         WHERE s.id=$1 AND s.user_id=$2 AND sd.service_date=$3::date AND s.status='ACTIVE'
         FOR UPDATE OF sd`,
        [subscriptionId, account.userId, serviceDate]
      );
      const day = current.rows[0];
      if (!day) throw new Error("NOT_FOUND");
      if (!["PLANNED", "AVAILABLE"].includes(day.status)) throw new Error("UNAVAILABLE");

      if (fulfillmentType === "PICKUP") {
        const point = await client.query<{ id: string; code: string; name: string }>(
          `SELECT id::text, code, name FROM pickup_points WHERE code=$1 AND is_active=true LIMIT 1 FOR SHARE`,
          [pickupPointCode]
        );
        if (!point.rows[0]) throw new Error("POINT_NOT_FOUND");
        await client.query(
          `UPDATE subscription_days
           SET fulfillment_type='PICKUP', pickup_point_id=$2::uuid, requested_time=NULL, delivery_address=NULL
           WHERE id=$1`,
          [day.id, point.rows[0].id]
        );
        await client.query(
          `INSERT INTO manager_events(event_type,entity_id,payload)
           VALUES('SUBSCRIPTION_FULFILLMENT_CHANGED',$1,$2::jsonb)`,
          [subscriptionId, JSON.stringify({ serviceDate, fulfillmentType, pickupPointCode: point.rows[0].code, pickupPointName: point.rows[0].name })]
        );
        return { fulfillmentType, pickupPointCode: point.rows[0].code, pickupPointName: point.rows[0].name, requestedTime: null };
      }

      await client.query(
        `UPDATE subscription_days
         SET fulfillment_type='DELIVERY', pickup_point_id=NULL, requested_time=$2, delivery_address=$3
         WHERE id=$1`,
        [day.id, requestedTime, deliveryAddress]
      );
      await client.query(
        `INSERT INTO manager_events(event_type,entity_id,payload)
         VALUES('SUBSCRIPTION_FULFILLMENT_CHANGED',$1,$2::jsonb)`,
        [subscriptionId, JSON.stringify({ serviceDate, fulfillmentType, requestedTime, deliveryAddress })]
      );
      return { fulfillmentType, pickupPointCode: null, pickupPointName: null, requestedTime };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const message = code === "NOT_FOUND" ? "Этот день подписки не найден"
      : code === "UNAVAILABLE" ? "Для этого дня способ получения уже нельзя изменить"
      : code === "POINT_NOT_FOUND" ? "Точка самовывоза недоступна. Выберите другую."
      : "Не удалось изменить способ получения";
    return NextResponse.json({ ok: false, error: message }, { status: 409 });
  }
}
