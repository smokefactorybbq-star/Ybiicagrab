import { NextRequest, NextResponse } from "next/server";
import { withTransaction } from "../../../../../lib/db";
import { createSessionToken, hashSessionToken, setSessionCookie } from "../../../../../lib/auth";
import { normalizeInternationalPhone, validateSmsMktOtp } from "../../../../../lib/smsmkt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { phone?: unknown; otp?: unknown; challengeId?: unknown };
    const phone = normalizeInternationalPhone(body.phone);
    const otp = String(body.otp || "").replace(/\D/g, "").slice(0, 10);
    const challengeId = String(body.challengeId || "").trim();
    if (!/^\+[1-9]\d{7,14}$/.test(phone) || otp.length < 4 || !challengeId) {
      return NextResponse.json({ ok: false, error: "Проверьте номер и SMS-код" }, { status: 400 });
    }

    const prepared = await withTransaction(async (client) => {
      const result = await client.query<{ id: string; token: string; ref_code: string; attempts: number }>(
        `SELECT id::text,token,COALESCE(ref_code,'') AS ref_code,attempts
         FROM sms_otp_challenges
         WHERE id=$1 AND phone=$2 AND used_at IS NULL AND expires_at>now()
         FOR UPDATE`, [challengeId, phone]
      );
      const row = result.rows[0];
      if (!row || row.attempts >= 6) throw new Error("OTP_EXPIRED");
      await client.query(`UPDATE sms_otp_challenges SET attempts=attempts+1 WHERE id=$1`, [row.id]);
      return row;
    });

    await validateSmsMktOtp(prepared.token, otp, prepared.ref_code);
    const sessionToken = createSessionToken();
    const account = await withTransaction(async (client) => {
      const challenge = await client.query<{ id: string }>(
        `SELECT id::text FROM sms_otp_challenges WHERE id=$1 AND phone=$2 AND used_at IS NULL AND expires_at>now() FOR UPDATE`,
        [challengeId, phone]
      );
      if (!challenge.rows[0]) throw new Error("OTP_ALREADY_USED");

      const existingAccount = await client.query<{ user_id: string; full_name: string; address: string | null; terms_accepted_at: string | null }>(
        `SELECT ca.user_id::text,u.full_name,u.address,ca.terms_accepted_at::text
         FROM customer_accounts ca JOIN users u ON u.id=ca.user_id WHERE ca.phone=$1 LIMIT 1 FOR UPDATE`, [phone]
      );
      let userId = existingAccount.rows[0]?.user_id;
      let fullName = existingAccount.rows[0]?.full_name || "Пользователь MealPoint";
      let address = existingAccount.rows[0]?.address || "";
      let termsAcceptedAt = existingAccount.rows[0]?.terms_accepted_at || null;

      if (!userId) {
        const existingUser = await client.query<{ id: string; full_name: string; address: string | null }>(
          `SELECT id::text,full_name,address FROM users WHERE phone=$1 ORDER BY created_at ASC LIMIT 1 FOR UPDATE`, [phone]
        );
        if (existingUser.rows[0]) {
          userId = existingUser.rows[0].id;
          fullName = existingUser.rows[0].full_name;
          address = existingUser.rows[0].address || "";
        } else {
          const inserted = await client.query<{ id: string }>(
            `INSERT INTO users (full_name,phone) VALUES ('Пользователь MealPoint',$1) RETURNING id::text`, [phone]
          );
          userId = inserted.rows[0].id;
        }
        await client.query(
          `INSERT INTO customer_accounts (user_id,phone,password_hash) VALUES ($1,$2,'') ON CONFLICT (user_id) DO UPDATE SET phone=EXCLUDED.phone,updated_at=now()`,
          [userId, phone]
        );
      }

      await client.query(`UPDATE users SET phone=$2,updated_at=now() WHERE id=$1`, [userId, phone]);
      await client.query(
        `INSERT INTO customer_sessions (user_id,token_hash,expires_at) VALUES ($1,$2,now()+interval '90 days')`,
        [userId, hashSessionToken(sessionToken)]
      );
      await client.query(`UPDATE sms_otp_challenges SET used_at=now() WHERE id=$1`, [challengeId]);
      return { userId: userId!, fullName, phone, address, termsAcceptedAt };
    });

    const response = NextResponse.json({ ok: true, account });
    setSessionCookie(response, sessionToken);
    return response;
  } catch (error) {
    console.error("SMS OTP verify failed", error);
    const raw = error instanceof Error ? error.message : "";
    const invalid = raw.startsWith("SMSMKT_OTP_INVALID") || ["OTP_EXPIRED","OTP_ALREADY_USED"].includes(raw);
    return NextResponse.json({ ok: false, error: invalid ? "Неверный или просроченный SMS-код" : "Не удалось выполнить вход" }, { status: invalid ? 400 : 500 });
  }
}
