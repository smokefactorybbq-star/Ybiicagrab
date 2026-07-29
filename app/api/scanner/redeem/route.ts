import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { withTransaction } from "../../../../lib/db";
import { parseSubscriptionQrPayload, verifySubscriptionQrSignature } from "../../../../lib/qr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RedeemBody = {
  payload?: unknown;
  deviceId?: unknown;
  pickupPointName?: unknown;
  testMode?: unknown;
  serviceDate?: unknown;
};

type SubscriptionRow = {
  id: string;
  code: string;
  status: string;
  remaining_portions: number;
  selected_days: number;
  starts_on: string;
  ends_on: string;
  pickup_point_name: string | null;
  full_name: string;
  phone: string | null;
};

type DayRow = {
  id: string;
  service_date: string;
  status: string;
  redeemed_at: string | null;
};

class ScanError extends Error {
  constructor(
    public result: string,
    message: string,
    public httpStatus = 400,
    public details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

function getBangkokTodayIso() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function authorizeScanner(request: Request) {
  const expected = process.env.SCANNER_API_KEY || process.env.MANAGER_PASSWORD;
  const supplied = request.headers.get("x-scanner-key") || "";

  if (!expected) {
    throw new ScanError("SCANNER_NOT_CONFIGURED", "SCANNER_API_KEY не задан в Railway", 503);
  }
  if (supplied !== expected) {
    throw new ScanError("UNAUTHORIZED", "Неверный ключ сканера", 401);
  }
}

async function logScan(
  client: PoolClient,
  input: {
    subscriptionId: string;
    dayId: string;
    deviceId: string;
    pickupPointName: string;
    result: string;
    portionsAfter: number;
  }
) {
  await client.query(
    `INSERT INTO subscription_scans (
       subscription_id, subscription_day_id, pickup_point_id,
       device_id, token_nonce, result, pickup_point_name, portions_after
     ) VALUES ($1, $2, NULL, $3, $4, $5, $6, $7)`,
    [
      input.subscriptionId,
      input.dayId,
      input.deviceId,
      randomUUID(),
      input.result,
      input.pickupPointName,
      input.portionsAfter
    ]
  );
}

export async function POST(request: Request) {
  try {
    authorizeScanner(request);

    const body = await request.json() as RedeemBody;
    const payload = typeof body.payload === "string" ? body.payload.trim() : "";
    const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim().slice(0, 100) : "";
    const pickupPointName = typeof body.pickupPointName === "string"
      ? body.pickupPointName.trim().slice(0, 160)
      : "";
    const testMode = body.testMode === true;
    const requestedServiceDate = typeof body.serviceDate === "string" ? body.serviceDate.trim() : "";

    if (!payload) throw new ScanError("EMPTY_QR", "QR-код пустой");
    if (!deviceId) throw new ScanError("DEVICE_REQUIRED", "Укажите название устройства");
    if (!pickupPointName) throw new ScanError("PICKUP_POINT_REQUIRED", "Укажите пункт выдачи");

    const parsed = parseSubscriptionQrPayload(payload);
    if (!parsed) throw new ScanError("INVALID_QR", "Это не QR-код MealPoint");

    let today = getBangkokTodayIso();
    if (testMode) {
      if (process.env.SCANNER_TEST_MODE !== "true") {
        throw new ScanError("TEST_MODE_DISABLED", "Тестовый режим отключён в Railway", 403);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedServiceDate)) {
        throw new ScanError("TEST_DATE_REQUIRED", "Укажите дату тестового списания");
      }
      today = requestedServiceDate;
    }

    const scanResult = await withTransaction(async (client) => {
      const subscriptionResult = await client.query<SubscriptionRow>(
        `SELECT
           s.id, s.code, s.status, s.remaining_portions, s.selected_days,
           s.starts_on::text, s.ends_on::text, s.pickup_point_name,
           u.full_name, u.phone
         FROM subscriptions s
         JOIN users u ON u.id = s.user_id
         WHERE s.id = $1
         FOR UPDATE`,
        [parsed.subscriptionId]
      );

      const subscription = subscriptionResult.rows[0];
      if (!subscription) throw new ScanError("INVALID_QR", "Подписка не найдена", 404);

      if (!verifySubscriptionQrSignature(subscription.id, subscription.code, parsed.signature)) {
        throw new ScanError("INVALID_SIGNATURE", "QR-код повреждён или подделан", 403);
      }

      if (subscription.status === "COMPLETED" || subscription.remaining_portions < 1) {
        throw new ScanError("NO_PORTIONS", "В подписке не осталось обедов", 409, {
          customerName: subscription.full_name,
          code: subscription.code,
          remainingPortions: 0
        });
      }

      if (subscription.status !== "ACTIVE") {
        throw new ScanError("NOT_ACTIVE", "Подписка сейчас не активна", 409, {
          customerName: subscription.full_name,
          code: subscription.code,
          status: subscription.status
        });
      }

      const dayResult = await client.query<DayRow>(
        `SELECT id, service_date::text, status, redeemed_at
         FROM subscription_days
         WHERE subscription_id = $1 AND service_date = $2::date
         FOR UPDATE`,
        [subscription.id, today]
      );

      const day = dayResult.rows[0];
      if (!day) {
        throw new ScanError("NOT_SCHEDULED_TODAY", "На сегодня обед по этой подписке не запланирован", 409, {
          customerName: subscription.full_name,
          code: subscription.code,
          startsOn: subscription.starts_on,
          endsOn: subscription.ends_on,
          remainingPortions: subscription.remaining_portions
        });
      }

      if (day.status === "REDEEMED") {
        await logScan(client, {
          subscriptionId: subscription.id,
          dayId: day.id,
          deviceId,
          pickupPointName,
          result: "ALREADY_REDEEMED",
          portionsAfter: subscription.remaining_portions
        });

        throw new ScanError("ALREADY_REDEEMED", "Сегодняшний обед уже был получен", 409, {
          customerName: subscription.full_name,
          code: subscription.code,
          serviceDate: day.service_date,
          redeemedAt: day.redeemed_at,
          remainingPortions: subscription.remaining_portions
        });
      }

      if (["PAUSE_REQUESTED", "PAUSED"].includes(day.status)) {
        throw new ScanError("DAY_PAUSED", "На сегодня оформлена пауза", 409, {
          customerName: subscription.full_name,
          code: subscription.code,
          serviceDate: day.service_date,
          remainingPortions: subscription.remaining_portions
        });
      }

      if (day.status !== "AVAILABLE") {
        throw new ScanError("DAY_UNAVAILABLE", "Сегодняшний обед недоступен для списания", 409, {
          customerName: subscription.full_name,
          code: subscription.code,
          dayStatus: day.status,
          remainingPortions: subscription.remaining_portions
        });
      }

      const remainingAfter = Math.max(0, subscription.remaining_portions - 1);

      await client.query(
        `UPDATE subscription_days
         SET status = 'REDEEMED', redeemed_at = now()
         WHERE id = $1`,
        [day.id]
      );

      await client.query(
        `UPDATE subscriptions
         SET remaining_portions = $1,
             status = CASE WHEN $1 = 0 THEN 'COMPLETED'::subscription_status ELSE status END,
             updated_at = now()
         WHERE id = $2`,
        [remainingAfter, subscription.id]
      );

      await logScan(client, {
        subscriptionId: subscription.id,
        dayId: day.id,
        deviceId,
        pickupPointName,
        result: "REDEEMED",
        portionsAfter: remainingAfter
      });

      await client.query(
        `INSERT INTO manager_events (event_type, entity_id, payload)
         VALUES ('SUBSCRIPTION_REDEEMED', $1, $2::jsonb)`,
        [subscription.id, JSON.stringify({
          code: subscription.code,
          customerName: subscription.full_name,
          serviceDate: today,
          deviceId,
          pickupPointName,
          remainingPortions: remainingAfter,
          testMode
        })]
      );

      return {
        customerName: subscription.full_name,
        phone: subscription.phone,
        code: subscription.code,
        serviceDate: today,
        remainingPortions: remainingAfter,
        selectedDays: subscription.selected_days,
        pickupPointName,
        subscriptionId: subscription.id,
        testMode
      };
    });

    return NextResponse.json({
      ok: true,
      result: "REDEEMED",
      message: "Один обед успешно списан",
      ...scanResult
    });
  } catch (error) {
    if (error instanceof ScanError) {
      return NextResponse.json({
        ok: false,
        result: error.result,
        error: error.message,
        ...error.details
      }, { status: error.httpStatus });
    }

    console.error("Redeem subscription failed", error);
    return NextResponse.json({
      ok: false,
      result: "SERVER_ERROR",
      error: "Не удалось выполнить списание"
    }, { status: 500 });
  }
}
