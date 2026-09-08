import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { createOtpCode, hashOtp, sendOtpSms } from "../../../../../lib/sms";
import { normalizePhone } from "../../../../../lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let otpId = "";
  try {
    const body = await request.json() as { phone?: unknown };
    const phone = normalizePhone(typeof body.phone === "string" ? body.phone : "");
    if (phone.length < 8) return NextResponse.json({ ok: false, error: "Введите корректный номер телефона" }, { status: 400 });

    await query(`DELETE FROM phone_otp_codes WHERE expires_at <= now() OR consumed_at IS NOT NULL`);
    const recent = await query<{ created_at: string }>(
      `SELECT created_at::text FROM phone_otp_codes WHERE phone = $1 AND created_at > now() - interval '60 seconds' ORDER BY created_at DESC LIMIT 1`,
      [phone]
    );
    if (recent.rowCount) return NextResponse.json({ ok: false, error: "Новый код можно запросить через минуту" }, { status: 429 });

    const code = createOtpCode();
    const codeHash = hashOtp(phone, code);
    const inserted = await query<{ id: string }>(
      `INSERT INTO phone_otp_codes (phone, code_hash, expires_at) VALUES ($1, $2, now() + interval '5 minutes') RETURNING id::text`,
      [phone, codeHash]
    );
    otpId = inserted.rows[0]?.id || "";
    const delivery = await sendOtpSms(phone, code);
    return NextResponse.json({ ok: true, phone, expiresInSeconds: 300, ...(delivery.debugCode ? { debugCode: delivery.debugCode } : {}) });
  } catch (error) {
    if (otpId) await query(`DELETE FROM phone_otp_codes WHERE id = $1`, [otpId]).catch(() => undefined);
    console.error("Phone OTP request failed", error);
    const message = error instanceof Error && error.message.includes("not configured")
      ? "Отправка SMS ещё не настроена на сервере"
      : "Не удалось отправить код. Попробуйте ещё раз.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
