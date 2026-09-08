import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAccount } from "../../../../lib/auth";
import { getAppClock } from "../../../../lib/app-time";
import { withTransaction } from "../../../../lib/db";
import { consumeRateLimit } from "../../../../lib/rate-limit";
import { isSameOriginMutation } from "../../../../lib/request-security";
import { notifyManagerTelegram } from "../../../../lib/telegram";
import { parsePickupPointQrPayload, verifyPickupPointQrSignature } from "../../../../lib/qr";
import { findPickupQrPointByCode } from "../../../../data/pickupQrPoints";
import { assertPickupLockOnline, requestPickupLockOpen } from "../../../../lib/pickup-lock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC_ERROR = "Ошибка чтения QR";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c] || c));
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ ok:false, error:"Недопустимый источник запроса" }, { status:403 });
  const account = await getAuthenticatedAccount(request);
  if (!account) return NextResponse.json({ ok:false, error:"Требуется вход" }, { status:401 });

  const rate = await consumeRateLimit(`pickup-scan:${account.userId}`, 12, 60);
  if (!rate.allowed) return NextResponse.json({ ok:false, error:GENERIC_ERROR }, { status:429, headers:{"Retry-After":String(rate.retryAfterSeconds)} });

  try {
    const body = await request.json() as { subscriptionId?: unknown; qrPayload?: unknown };
    const subscriptionId = typeof body.subscriptionId === "string" ? body.subscriptionId.trim() : "";
    const qrPayload = typeof body.qrPayload === "string" ? body.qrPayload.trim() : "";
    const parsed = parsePickupPointQrPayload(qrPayload);
    if (!subscriptionId || !parsed || !verifyPickupPointQrSignature(parsed.pointCode, parsed.signature)) {
      return NextResponse.json({ ok:false, error:GENERIC_ERROR }, { status:400 });
    }
    const point = findPickupQrPointByCode(parsed.pointCode);
    if (!point) return NextResponse.json({ ok:false, error:GENERIC_ERROR }, { status:400 });

    const clock = await getAppClock();
    if (clock.hour >= 22) return NextResponse.json({ ok:false, error:GENERIC_ERROR }, { status:409 });

    const redeemed = await withTransaction(async (client) => {
      const current = await client.query<{
        subscription_id:string; code:string; subscription_status:string; fulfillment_type:string;
        pickup_point_name:string|null; remaining_portions:number; day_id:string; day_status:string;
        redeemed_at:string|null; consumed_at:string|null; full_name:string; phone:string|null;
      }>(
        `SELECT s.id::text AS subscription_id, s.code, s.status::text AS subscription_status,
                s.fulfillment_type, s.pickup_point_name, s.remaining_portions,
                sd.id::text AS day_id, sd.status::text AS day_status, sd.redeemed_at, sd.consumed_at,
                u.full_name, u.phone
         FROM subscriptions s
         JOIN subscription_days sd ON sd.subscription_id=s.id AND sd.service_date=$3::date
         JOIN users u ON u.id=s.user_id
         WHERE s.id=$1 AND s.user_id=$2
         FOR UPDATE OF s, sd`,
        [subscriptionId, account.userId, clock.date]
      );
      const row = current.rows[0];
      if (!row || row.fulfillment_type !== "PICKUP" || !["ACTIVE","COMPLETED"].includes(row.subscription_status)) throw new Error("BAD_QR");
      if (!["PLANNED","AVAILABLE"].includes(row.day_status) || row.redeemed_at || row.consumed_at) throw new Error("ALREADY");

      const legacyPoint = !row.pickup_point_name || row.pickup_point_name === "Smoke Factory BBQ";
      if (!legacyPoint && row.pickup_point_name !== point.name) throw new Error("WRONG_POINT");

      // If this point has an electronic lock configured, do not consume the meal
      // while its controller is offline. This prevents charging a customer who
      // cannot physically open the fridge.
      await assertPickupLockOnline(client, point.code);

      await client.query(
        `INSERT INTO subscription_scans (subscription_id, subscription_day_id, device_id, token_nonce, result, pickup_point_name)
         VALUES ($1,$2,'customer-web',$3,'REDEEMED',$4)`,
        [subscriptionId, row.day_id, randomBytes(18).toString("base64url"), point.name]
      );
      await client.query(
        `UPDATE subscription_days
         SET status='REDEEMED', redeemed_at=now(), consumed_at=now(), pickup_redeemed_point_name=$2
         WHERE id=$1`,
        [row.day_id, point.name]
      );
      const updated = await client.query<{ remaining_portions:number }>(
        `UPDATE subscriptions
         SET pickup_point_name=CASE WHEN pickup_point_name IS NULL OR pickup_point_name='' OR pickup_point_name='Smoke Factory BBQ' THEN $2 ELSE pickup_point_name END,
             remaining_portions=GREATEST(0,remaining_portions-1),
             status=CASE WHEN GREATEST(0,remaining_portions-1)=0 THEN 'COMPLETED'::subscription_status ELSE status END,
             updated_at=now()
         WHERE id=$1
         RETURNING remaining_portions`,
        [subscriptionId, point.name]
      );
      const remaining = Number(updated.rows[0]?.remaining_portions ?? Math.max(0, row.remaining_portions - 1));
      const lockRequested = await requestPickupLockOpen(client, {
        pointCode: point.code,
        subscriptionId,
        subscriptionDayId: row.day_id
      });
      await client.query(
        `INSERT INTO manager_events (event_type, entity_id, payload)
         VALUES ('PICKUP_REDEEMED',$1,$2::jsonb)`,
        [subscriptionId, JSON.stringify({ serviceDate:clock.date, pointName:point.name, pointCode:point.code, fullName:row.full_name, phone:row.phone, code:row.code, remaining, lockRequested })]
      );
      return { fullName:row.full_name, phone:row.phone, code:row.code, pointName:point.name, pointCode:point.code, remaining, lockRequested };
    });

    void notifyManagerTelegram({ text:[
      "<b>✅ Клиент забрал обед</b>",
      `Клиент: ${escapeHtml(redeemed.fullName)}`,
      redeemed.phone ? `Телефон: ${escapeHtml(redeemed.phone)}` : "",
      `Подписка: ${escapeHtml(redeemed.code)}`,
      `Пункт: ${escapeHtml(redeemed.pointName)}`,
      `Дата: ${clock.date}`,
      `Осталось дней: ${redeemed.remaining}`
    ].filter(Boolean).join("\n") });

    return NextResponse.json({
      ok:true,
      message: redeemed.lockRequested
        ? "Доступ разрешён. Замок открыт, заберите обед."
        : "Обед получен. Один день подписки списан.",
      remainingPortions:redeemed.remaining,
      pickupPointName:redeemed.pointName,
      lockOpened:redeemed.lockRequested
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "LOCK_OFFLINE") {
      return NextResponse.json({ ok:false, error:"Замок точки сейчас не на связи. Обед не списан. Позовите сотрудника." }, { status:503 });
    }
    if (["ALREADY","WRONG_POINT","BAD_QR"].includes(code) || (error instanceof Error && /duplicate key/i.test(error.message))) {
      return NextResponse.json({ ok:false, error:GENERIC_ERROR }, { status:409 });
    }
    console.error("Pickup QR redemption failed", error);
    return NextResponse.json({ ok:false, error:GENERIC_ERROR }, { status:400 });
  }
}
