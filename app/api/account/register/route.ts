import { NextRequest, NextResponse } from "next/server";
import { withTransaction } from "../../../../lib/db";
import { createSessionToken, hashPassword, hashSessionToken, setSessionCookie } from "../../../../lib/auth";
import { normalizePhone } from "../../../../lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { phone?: unknown; password?: unknown; passwordRepeat?: unknown };
    const phone = normalizePhone(typeof body.phone === "string" ? body.phone : "");
    const password = typeof body.password === "string" ? body.password : "";
    const passwordRepeat = typeof body.passwordRepeat === "string" ? body.passwordRepeat : "";

    if (phone.length < 8) return NextResponse.json({ ok: false, error: "Укажите корректный номер телефона" }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ ok: false, error: "Пароль должен содержать минимум 8 символов" }, { status: 400 });
    if (password !== passwordRepeat) return NextResponse.json({ ok: false, error: "Пароли не совпадают" }, { status: 400 });

    const sessionToken = createSessionToken();
    const passwordHash = hashPassword(password);

    const account = await withTransaction(async (client) => {
      const duplicate = await client.query(`SELECT 1 FROM customer_accounts WHERE phone = $1 LIMIT 1`, [phone]);
      if (duplicate.rowCount) throw new Error("PHONE_EXISTS");

      const existingUser = await client.query<{ id: string; full_name: string }>(
        `SELECT id, full_name FROM users WHERE phone = $1 ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
        [phone]
      );

      let userId = existingUser.rows[0]?.id;
      let fullName = existingUser.rows[0]?.full_name || "Пользователь MealPoint";
      if (!userId) {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO users (full_name, phone) VALUES ($1, $2) RETURNING id`,
          [fullName, phone]
        );
        userId = inserted.rows[0].id;
      }

      await client.query(
        `INSERT INTO customer_accounts (user_id, phone, password_hash)
         VALUES ($1, $2, $3)`,
        [userId, phone, passwordHash]
      );
      await client.query(
        `INSERT INTO customer_sessions (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '90 days')`,
        [userId, hashSessionToken(sessionToken)]
      );

      return { userId, fullName };
    });

    const response = NextResponse.json({
      ok: true,
      account: { ...account, phone, address: "", termsAcceptedAt: null }
    }, { status: 201 });
    setSessionCookie(response, sessionToken);
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "PHONE_EXISTS") {
      return NextResponse.json({ ok: false, error: "Аккаунт с таким номером уже зарегистрирован" }, { status: 409 });
    }
    console.error("Account registration failed", error);
    return NextResponse.json({ ok: false, error: "Не удалось зарегистрировать аккаунт" }, { status: 500 });
  }
}
