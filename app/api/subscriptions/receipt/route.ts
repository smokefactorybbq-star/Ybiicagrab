import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAccount } from "../../../../lib/auth";
import { query, withTransaction } from "../../../../lib/db";
import { notifyBotReceipt } from "../../../../lib/tgfoodbot";
import { notifyManagerTelegram } from "../../../../lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const account = await getAuthenticatedAccount(request);
    if (!account) return NextResponse.json({ ok: false, error: "Требуется вход" }, { status: 401 });
    const form = await request.formData();
    const subscriptionId = String(form.get("subscriptionId") || "").trim();
    const file = form.get("file");
    if (!subscriptionId || !(file instanceof File)) return NextResponse.json({ ok: false, error: "Выберите чек" }, { status: 400 });
    if (!ALLOWED.has(file.type) || file.size < 1 || file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "Разрешены JPG, PNG, WEBP или PDF до 8 МБ" }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());

    const subscription = await query<{ id: string; code: string; payment_method: string | null; total_thb: number }>(
      `SELECT id::text,code,payment_method,total_thb FROM subscriptions WHERE id=$1 AND user_id=$2 LIMIT 1`,
      [subscriptionId, account.userId]
    );
    const sub = subscription.rows[0];
    if (!sub) return NextResponse.json({ ok: false, error: "Подписка не найдена" }, { status: 404 });
    if (String(sub.payment_method || "").toUpperCase() !== "PROMPTPAY") {
      return NextResponse.json({ ok: false, error: "Чек нужен только для PromptPay" }, { status: 400 });
    }

    const receiptId = await withTransaction(async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO subscription_receipts (subscription_id,user_id,file_name,mime_type,file_data)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (subscription_id) DO UPDATE SET file_name=EXCLUDED.file_name,mime_type=EXCLUDED.mime_type,file_data=EXCLUDED.file_data,uploaded_at=now()
         RETURNING id::text`,
        [sub.id, account.userId, file.name.slice(0, 180), file.type, buffer]
      );
      await client.query(`UPDATE subscriptions SET receipt_received_at=now(),updated_at=now() WHERE id=$1`, [sub.id]);
      return result.rows[0].id;
    });

    const botPayload = {
      subscription_id: sub.id,
      subscription_code: sub.code,
      client_name: account.fullName,
      client_phone: account.phone,
      total: Number(sub.total_thb),
      file_name: file.name,
      mime_type: file.type,
      file_base64: buffer.toString("base64"),
    };
    try {
      await notifyBotReceipt(botPayload);
    } catch (error) {
      console.error("Receipt bot delivery failed", error);
      void notifyManagerTelegram({ text: `<b>🧾 MealPoint: получен чек</b>\nКлиент: ${account.fullName}\nТелефон: ${account.phone}\nПодписка: ${sub.code}\nСумма: ${sub.total_thb} ฿\nОткройте чек в кабинете менеджера.` });
    }
    return NextResponse.json({ ok: true, receiptId, uploadedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Subscription receipt upload failed", error);
    return NextResponse.json({ ok: false, error: "Не удалось загрузить чек" }, { status: 500 });
  }
}
