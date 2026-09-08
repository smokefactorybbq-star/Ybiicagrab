import { NextRequest, NextResponse } from "next/server";
import { createBrowserSession, getOrCreatePhoneAccount, setSessionCookie } from "../../../../../lib/auth";
import { query, withTransaction } from "../../../../../lib/db";
import { hashOtp } from "../../../../../lib/sms";
import { normalizePhone } from "../../../../../lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { phone?: unknown; code?: unknown };
    const phone = normalizePhone(typeof body.phone === "string" ? body.phone : "");
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (phone.length < 8 || !/^\d{6}$/.test(code)) return NextResponse.json({ ok: false, error: "Введите телефон и 6-значный код" }, { status: 400 });

    const otp = await query<{ id: string; code_hash: string; attempts: number }>(
      `SELECT id::text, code_hash, attempts FROM phone_otp_codes
       WHERE phone = $1 AND consumed_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1`,
      [phone]
    );
    const row = otp.rows[0];
    if (!row) return NextResponse.json({ ok: false, error: "Код истёк. Запросите новый." }, { status: 400 });
    if (row.attempts >= 5) return NextResponse.json({ ok: false, error: "Слишком много попыток. Запросите новый код." }, { status: 429 });

    if (hashOtp(phone, code) !== row.code_hash) {
      await query(`UPDATE phone_otp_codes SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
      return NextResponse.json({ ok: false, error: "Неверный код" }, { status: 400 });
    }

    await withTransaction(async (client) => {
      await client.query(`UPDATE phone_otp_codes SET consumed_at = now() WHERE id = $1`, [row.id]);
      await client.query(`DELETE FROM phone_otp_codes WHERE phone = $1 AND id <> $2`, [phone, row.id]);
    });

    const userId = await getOrCreatePhoneAccount(phone);
    const token = await createBrowserSession(userId);
    const response = NextResponse.json({ ok: true, phone });
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    console.error("Phone OTP verification failed", error);
    return NextResponse.json({ ok: false, error: "Не удалось выполнить вход" }, { status: 500 });
  }
}
