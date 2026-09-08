import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { normalizeInternationalPhone, sendSmsMktOtp } from "../../../../../lib/smsmkt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { phone?: unknown };
    const phone = normalizeInternationalPhone(body.phone);
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      return NextResponse.json({ ok: false, error: "Введите номер с кодом страны, например +66812345678" }, { status: 400 });
    }

    const recent = await query<{ created_at: string }>(
      `SELECT created_at::text FROM sms_otp_challenges WHERE phone=$1 ORDER BY created_at DESC LIMIT 1`, [phone]
    );
    if (recent.rows[0] && Date.now() - new Date(recent.rows[0].created_at).getTime() < 60_000) {
      return NextResponse.json({ ok: false, error: "Повторный код можно запросить через минуту" }, { status: 429 });
    }

    const refCode = randomBytes(3).toString("hex").toUpperCase();
    const sent = await sendSmsMktOtp(phone, refCode);
    const created = await query<{ id: string }>(
      `INSERT INTO sms_otp_challenges (phone, token, ref_code, expires_at)
       VALUES ($1,$2,$3,now()+interval '10 minutes') RETURNING id::text`,
      [phone, sent.token, sent.refCode]
    );
    return NextResponse.json({ ok: true, challengeId: created.rows[0].id, phone, refCode: sent.refCode });
  } catch (error) {
    console.error("SMS OTP send failed", error);
    const message = error instanceof Error && error.message === "SMSMKT_NOT_CONFIGURED"
      ? "SMSMKT не настроен в Railway Variables"
      : "Не удалось отправить SMS-код";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
