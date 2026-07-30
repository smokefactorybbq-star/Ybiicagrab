import * as QRCode from "qrcode";
import { NextRequest } from "next/server";
import { getAuthenticatedAccount } from "../../../../lib/auth";
import { query } from "../../../../lib/db";
import { buildSubscriptionQrPayload } from "../../../../lib/qr";
import { getBangkokTodayIso } from "../../../../lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function textResponse(message: string, status: number) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  try {
    const account = await getAuthenticatedAccount(request);
    if (!account) return textResponse("Требуется вход", 401);
    const id = request.nextUrl.searchParams.get("id")?.trim() || "";
    if (!id) return textResponse("Не указана подписка", 400);

    const result = await query<{ id: string; code: string; status: string; qr_paused_today: boolean }>(
      `SELECT s.id, s.code, s.status,
         EXISTS (
           SELECT 1 FROM subscription_days sd
           WHERE sd.subscription_id = s.id
             AND sd.service_date = $3::date
             AND sd.status IN ('PAUSED', 'PAUSE_REQUESTED')
         ) AS qr_paused_today
       FROM subscriptions s
       WHERE s.id = $1 AND s.user_id = $2
       LIMIT 1`,
      [id, account.userId, getBangkokTodayIso()]
    );
    const subscription = result.rows[0];
    if (!subscription) return textResponse("Подписка не найдена", 404);
    if (subscription.status !== "ACTIVE") return textResponse("Подписка ещё не активирована", 403);
    if (subscription.qr_paused_today) return textResponse("Сегодня подписка поставлена на паузу", 403);

    const svg = await QRCode.toString(buildSubscriptionQrPayload(subscription.id, subscription.code), {
      type: "svg", width: 260, margin: 1, errorCorrectionLevel: "H"
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
    return textResponse("Не удалось создать QR", 500);
  }
}
