import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { loyaltyPercent } from "../../../../lib/shop-account";
import { verifyLoyaltyRequest } from "../../../../lib/loyalty-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function boundedInt(value: unknown, max: number) {
  const n = Number(value || 0);
  return Math.max(0, Math.min(max, Number.isFinite(n) ? Math.floor(n) : 0));
}

export async function POST(request: NextRequest) {
  const client = await getPool().connect();
  try {
    const body = (await request.json()) as Record<string, unknown>;
    verifyLoyaltyRequest(
      body,
      request.headers.get("x-loyalty-timestamp") || "",
      request.headers.get("x-loyalty-signature") || ""
    );

    const telegramId = String(body.telegramId || "").trim();
    const orderRef = String(body.orderRef || "").trim().slice(0, 160);
    const itemsTotal = boundedInt(body.itemsTotal, 1_000_000);
    const delivery = boundedInt(body.delivery, 100_000);
    const requestedBonus = boundedInt(body.requestedBonus, 1_000_000);
    const requestId = `order:${telegramId}:${orderRef}`;

    if (!/^\d+$/.test(telegramId) || !orderRef || itemsTotal <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid loyalty order data" }, { status: 400 });
    }

    await client.query("BEGIN");
    const existing = await client.query<any>(
      `SELECT * FROM loyalty_transactions WHERE request_id=$1 FOR UPDATE`,
      [requestId]
    );
    if (existing.rowCount) {
      const row = existing.rows[0];
      await client.query("COMMIT");
      return NextResponse.json({
        ok: true,
        idempotent: true,
        bonusUsed: Number(row.bonus_used || 0),
        cashbackPercent: Number(row.cashback_percent || 0),
        cashbackEarned: Number(row.cashback_earned || 0),
        balanceBefore: Number(row.balance_before || 0),
        balanceAfter: Number(row.balance_after || 0),
        lifetimeSpendBefore: Number(row.lifetime_spend_before || 0),
        lifetimeSpendAfter: Number(row.lifetime_spend_after || 0),
        maxRedeemPercent: 20,
        total: Math.max(0, Number(row.items_total || 0) - Number(row.bonus_used || 0) + Number(row.delivery_fee || 0))
      });
    }

    await client.query(
      `INSERT INTO users (telegram_id,created_at,updated_at,bonus_balance,lifetime_spend)
       VALUES ($1,NOW(),NOW(),0,0) ON CONFLICT (telegram_id) DO NOTHING`,
      [telegramId]
    );
    const userResult = await client.query<any>(
      `SELECT telegram_id,bonus_balance,lifetime_spend,manual_spend
       FROM users WHERE telegram_id=$1 FOR UPDATE`,
      [telegramId]
    );
    if (!userResult.rowCount) throw new Error("Loyalty user not found");

    const user = userResult.rows[0];
    const balanceBefore = Math.max(0, Number(user.bonus_balance || 0));
    const lifetimeSpendBefore = Math.max(Number(user.lifetime_spend || 0), Number(user.manual_spend || 0));
    const cashbackPercent = loyaltyPercent(lifetimeSpendBefore);
    const maxByOrder = Math.floor(itemsTotal * 0.2);
    const bonusUsed = Math.min(requestedBonus, balanceBefore, maxByOrder);
    const cashbackBase = Math.max(0, itemsTotal - bonusUsed);
    const cashbackEarned = Math.floor((cashbackBase * cashbackPercent) / 100);
    const balanceAfter = Math.max(0, balanceBefore - bonusUsed + cashbackEarned);
    const lifetimeSpendAfter = lifetimeSpendBefore + cashbackBase;

    await client.query(
      `UPDATE users SET bonus_balance=$2,lifetime_spend=$3,updated_at=NOW() WHERE telegram_id=$1`,
      [telegramId, balanceAfter, lifetimeSpendAfter]
    );
    await client.query(
      `INSERT INTO loyalty_transactions (
        request_id,telegram_id,order_ref,items_total,delivery_fee,bonus_used,cashback_percent,cashback_earned,
        balance_before,balance_after,lifetime_spend_before,lifetime_spend_after
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [requestId, telegramId, orderRef, itemsTotal, delivery, bonusUsed, cashbackPercent, cashbackEarned,
       balanceBefore, balanceAfter, lifetimeSpendBefore, lifetimeSpendAfter]
    );
    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      idempotent: false,
      bonusUsed,
      cashbackPercent,
      cashbackEarned,
      balanceBefore,
      balanceAfter,
      lifetimeSpendBefore,
      lifetimeSpendAfter,
      maxRedeemPercent: 20,
      maxRedeemAmount: maxByOrder,
      total: Math.max(0, itemsTotal - bonusUsed + delivery)
    });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* noop */ }
    console.error("POST /api/loyalty/settle", error);
    const auth = /signature|expired/i.test(error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      { ok: false, error: auth ? "Unauthorized loyalty request" : "Loyalty transaction failed" },
      { status: auth ? 401 : 500 }
    );
  } finally {
    client.release();
  }
}
