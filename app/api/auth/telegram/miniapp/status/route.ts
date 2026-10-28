import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, hashSessionToken, setSessionCookie } from "../../../../../../lib/auth";
import { withTransaction } from "../../../../../../lib/db";
import { hashTelegramLoginToken } from "../../../../../../lib/telegram-miniapp-login";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body.token || "").trim();
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return NextResponse.json({ ok: false, error: "Неверная сессия входа" }, { status: 400 });
    const tokenHash = hashTelegramLoginToken(token);

    const result = await withTransaction(async client => {
      const found = await client.query<{ id: string; approved_user_id: string | null; expired: boolean; consumed_at: string | null }>(
        `SELECT id::text, approved_user_id::text,
                (expires_at <= now()) AS expired,
                consumed_at::text
         FROM telegram_login_requests
         WHERE token_hash = $1
         LIMIT 1
         FOR UPDATE`,
        [tokenHash]
      );
      const row = found.rows[0];
      if (!row) return { state: "missing" as const };
      if (row.expired) return { state: "expired" as const };
      if (row.consumed_at) return { state: "consumed" as const };
      if (!row.approved_user_id) return { state: "pending" as const };

      const sessionToken = createSessionToken();
      await client.query(`DELETE FROM customer_sessions WHERE expires_at <= now()`);
      await client.query(
        `INSERT INTO customer_sessions (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '30 days')`,
        [row.approved_user_id, hashSessionToken(sessionToken)]
      );
      await client.query(`UPDATE telegram_login_requests SET consumed_at = now() WHERE id = $1`, [row.id]);
      return { state: "approved" as const, sessionToken };
    });

    if (result.state === "approved") {
      const response = NextResponse.json({ ok: true, state: "approved" }, { headers: { "Cache-Control": "no-store" } });
      setSessionCookie(response, result.sessionToken);
      return response;
    }
    if (result.state === "expired") return NextResponse.json({ ok: true, state: "expired" }, { headers: { "Cache-Control": "no-store" } });
    if (result.state === "pending") return NextResponse.json({ ok: true, state: "pending" }, { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ ok: true, state: result.state }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Telegram Mini App login status failed", error);
    return NextResponse.json({ ok: false, error: "Не удалось проверить вход через Telegram" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
