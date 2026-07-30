import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { createSessionToken, hashSessionToken, setSessionCookie, verifyPassword } from "../../../../lib/auth";
import { normalizePhone } from "../../../../lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { phone?: unknown; password?: unknown };
    const phone = normalizePhone(typeof body.phone === "string" ? body.phone : "");
    const password = typeof body.password === "string" ? body.password : "";

    const result = await query<{
      user_id: string;
      password_hash: string;
      full_name: string;
      address: string | null;
      terms_accepted_at: string | null;
    }>(
      `SELECT ca.user_id, ca.password_hash, ca.terms_accepted_at::text,
              u.full_name, u.address
       FROM customer_accounts ca
       JOIN users u ON u.id = ca.user_id
       WHERE ca.phone = $1
       LIMIT 1`,
      [phone]
    );

    const row = result.rows[0];
    if (!row || !verifyPassword(password, row.password_hash)) {
      return NextResponse.json({ ok: false, error: "Неверный номер телефона или пароль" }, { status: 401 });
    }

    const token = createSessionToken();
    await query(
      `INSERT INTO customer_sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '90 days')`,
      [row.user_id, hashSessionToken(token)]
    );

    const response = NextResponse.json({
      ok: true,
      account: {
        userId: row.user_id,
        fullName: row.full_name,
        phone,
        address: row.address || "",
        termsAcceptedAt: row.terms_accepted_at
      }
    });
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    console.error("Account login failed", error);
    return NextResponse.json({ ok: false, error: "Не удалось выполнить вход" }, { status: 500 });
  }
}
