import * as QRCode from "qrcode";
import { query } from "../../../../lib/db";
import { buildSubscriptionQrPayload } from "../../../../lib/qr";
import { hashToken } from "../../../../lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QrSubscriptionRow = {
  id: string;
  code: string;
  status: string;
  account_access_hash: string | null;
  qr_secret_hash: string;
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
      `SELECT id, code, status, account_access_hash, qr_secret_hash
       FROM subscriptions
       WHERE id = $1
       LIMIT 1`,
      [id]
    );

    const subscription = result.rows[0];
    const expectedHash = subscription?.account_access_hash || subscription?.qr_secret_hash;

    if (!subscription || !expectedHash || hashToken(accessToken) !== expectedHash) {
      return textResponse("Подписка не найдена", 404);
    }

    if (subscription.status !== "ACTIVE") {
      return textResponse("Подписка ещё не активирована", 403);
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
