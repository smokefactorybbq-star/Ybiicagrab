import * as QRCode from "qrcode";
import { query } from "../../../../lib/db";
import { buildSubscriptionQrPayload } from "../../../../lib/qr";
import { getBangkokTodayIso, hashToken } from "../../../../lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QrSubscriptionRow = {
  id: string;
  code: string;
  status: string;
  account_access_hash: string | null;
  qr_secret_hash: string;
  qr_paused_today: boolean;
};

function textResponse(message: string, status: number) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim() || "";
    const accessToken = url.searchParams.get("accessToken")?.trim() || "";

    if (!id || !accessToken) return textResponse("Не указаны данные подписки", 400);

    const result = await query<QrSubscriptionRow>(
      `SELECT
         s.id, s.code, s.status, s.account_access_hash, s.qr_secret_hash,
         EXISTS (
           SELECT 1
           FROM subscription_days sd
           WHERE sd.subscription_id = s.id
             AND sd.service_date = $2::date
             AND sd.status IN ('PAUSED', 'PAUSE_REQUESTED')
         ) AS qr_paused_today
       FROM subscriptions s
       WHERE s.id = $1
       LIMIT 1`,
      [id, getBangkokTodayIso()]
    );

    const subscription = result.rows[0];
    const expectedHash = subscription?.account_access_hash || subscription?.qr_secret_hash;

    if (!subscription || !expectedHash || hashToken(accessToken) !== expectedHash) {
      return textResponse("Подписка не найдена", 404);
    }

    if (subscription.status !== "ACTIVE") {
      return textResponse("Подписка ещё не активирована", 403);
    }
    if (subscription.qr_paused_today) {
      return textResponse("Сегодня подписка поставлена на паузу", 403);
    }

    const payload = buildSubscriptionQrPayload(subscription.id, subscription.code);
    const svg = await QRCode.toString(payload, {
      type: "svg",
      width: 260,
      margin: 1,
      errorCorrectionLevel: "H"
    });

    return new Response(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'"
      }
    });
  } catch (error) {
    console.error("Generate subscription QR failed", error);
    const message = error instanceof Error && error.message.includes("QR_SIGNING_SECRET")
      ? "QR_SIGNING_SECRET не настроен"
      : "Не удалось создать QR";
    return textResponse(message, 500);
  }
}
