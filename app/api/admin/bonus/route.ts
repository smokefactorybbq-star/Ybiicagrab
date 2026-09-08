import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { getShopAccountData } from "../../../../lib/shop-account";
import { verifyBonusRequest } from "../../../../lib/loyalty-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ok:false,error:"Неверный JSON"},{status:400}); }

  const telegramId = String(body?.telegramId || "").trim();
  const amount = Number(body?.amount);
  const managerId = Number(body?.managerId);
  const timestamp = Number(body?.timestamp);
  const requestId = String(body?.requestId || "").trim().slice(0, 250);
  const signature = String(request.headers.get("x-bonus-signature") || "").trim();

  if (!/^\d+$/.test(telegramId)) return NextResponse.json({ok:false,error:"Неверный Telegram ID"},{status:400});
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 10_000_000) return NextResponse.json({ok:false,error:"Неверная сумма"},{status:400});
  if (!Number.isSafeInteger(managerId) || managerId <= 0) return NextResponse.json({ok:false,error:"Неверный ID менеджера"},{status:400});
  if (!requestId) return NextResponse.json({ok:false,error:"Отсутствует requestId"},{status:400});

  try {
    verifyBonusRequest({ telegramId, amount, managerId, timestamp, requestId, signature });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ ok:false, error: message === "BONUS_EXPIRED" ? "Запрос устарел" : "Неверная подпись запроса" }, {status:401});
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const duplicate = await client.query<any>(
      `SELECT telegram_id,new_amount FROM loyalty_adjustments WHERE request_id=$1 LIMIT 1`,
      [requestId]
    );
    if (duplicate.rowCount) {
      await client.query("COMMIT");
      const account = await getShopAccountData(telegramId);
      return NextResponse.json({
        ok:true, duplicate:true, telegramId,
        previousAmount:Number(duplicate.rows[0].new_amount || 0),
        manualSpend:Number(account?.loyalty?.manualSpend || 0),
        orderSpend:Number(account?.loyalty?.orderSpend || 0),
        totalSpend:Number(account?.loyalty?.totalSpend || 0),
        discountPercent:Number(account?.loyalty?.discountPercent || 0)
      });
    }

    const previous = await client.query<any>(`SELECT manual_spend FROM users WHERE telegram_id=$1 FOR UPDATE`, [telegramId]);
    const previousAmount = Number(previous.rows[0]?.manual_spend || 0);
    await client.query(
      `INSERT INTO users (telegram_id,manual_spend,bonus_updated_at,bonus_updated_by,created_at,updated_at)
       VALUES ($1,$2,NOW(),$3,NOW(),NOW())
       ON CONFLICT (telegram_id) DO UPDATE SET manual_spend=EXCLUDED.manual_spend,
         bonus_updated_at=NOW(),bonus_updated_by=EXCLUDED.bonus_updated_by,updated_at=NOW()`,
      [telegramId, amount, managerId]
    );
    await client.query(
      `INSERT INTO loyalty_adjustments (request_id,telegram_id,previous_amount,new_amount,created_by,source)
       VALUES ($1,$2,$3,$4,$5,'manager_bonus')`,
      [requestId, telegramId, previousAmount, amount, managerId]
    );
    await client.query("COMMIT");

    const account = await getShopAccountData(telegramId);
    return NextResponse.json({
      ok:true, duplicate:false, telegramId, previousAmount,
      manualSpend:Number(account?.loyalty?.manualSpend ?? amount),
      orderSpend:Number(account?.loyalty?.orderSpend || 0),
      totalSpend:Number(account?.loyalty?.totalSpend ?? amount),
      discountPercent:Number(account?.loyalty?.discountPercent || 0)
    });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* noop */ }
    console.error("POST /api/admin/bonus", error);
    return NextResponse.json({ok:false,error:"Не удалось сохранить сумму"},{status:500});
  } finally {
    client.release();
  }
}
