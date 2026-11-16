import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { query, withTransaction } from "./db";
import { createSubscriptionCode } from "./subscriptions";
import { notifyManagerTelegram } from "./telegram";
import { decimal, thbAmount, paymentUrl, validateOrder } from "./limenthai-contract";

const BASE = "https://api.limenthai.com/partner-api/v1";
export function limenConfig() {
  const key = (process.env.LIMENTHAI_API_KEY || "").trim();
  const test = key.startsWith("lt_test_");
  if (process.env.LIMENTHAI_ENABLED !== "true" || (!test && !key.startsWith("lt_live_"))) throw new Error("LIMENTHAI_NOT_CONFIGURED");
  return {key,test};
}
export function limenAvailable() { try {limenConfig();return true;} catch {return false;} }
async function api(path: string, key: string, body?: object, idempotency?: string) {
  const response = await fetch(BASE + path, {method:body?"POST":"GET",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json",...(idempotency?{"Idempotency-Key":idempotency}:{})},body:body?JSON.stringify(body):undefined,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000)});
  if (!response.ok) throw new Error(`LIMENTHAI_HTTP_${response.status}`);
  return response.json();
}
type Payment = {subscription_id:string;partner_id:string;provider_id:string|null;amount_rub:string|null;total_thb:number;contract_version:string;payer_phone:string|null;provider_rate:string|null;test:boolean;state:string;payment_url:string|null;expires_at:string|null;lease:string|null;activated:boolean};
export async function syncLimen(id: string, owner?: string) {
  const config = limenConfig();
  // Persist request amount BEFORE calling the remote service. Retries reuse both
  // the exact body and idempotency key, even after a timeout or process crash.
  const lease = randomUUID();
  const p = await withTransaction(async client => {
    const s = await client.query(`SELECT id,user_id,payment_method,status,total_thb FROM subscriptions WHERE id=$1 FOR UPDATE`,[id]);
    if (!s.rows[0] || (owner && s.rows[0].user_id !== owner) || s.rows[0].payment_method !== "BANK_RU") throw new Error("NOT_FOUND");
    const r = await client.query<Payment>(`SELECT * FROM limenthai_payments WHERE subscription_id=$1 FOR UPDATE`,[id]);
    const row = r.rows[0];
    if (!row) throw new Error("LEGACY_PAYMENT");
    if (row.contract_version !== "THB_V1") throw new Error("OLD_CONTRACT_REQUIRES_REVIEW");
    if (row.test !== config.test) throw new Error("PAYMENT_MODE_MISMATCH");
    if (row.total_thb !== s.rows[0].total_thb) throw new Error("TOTAL_CHANGED");
    if (["paid","expired","declined"].includes(row.state)) return null;
    const acquired = await client.query(`UPDATE limenthai_payments SET lease=$2,lease_until=now()+interval '45 seconds',checked_at=now() WHERE subscription_id=$1 AND (lease_until IS NULL OR lease_until<now()) RETURNING subscription_id`,[id,lease]);
    return acquired.rowCount ? row : null;
  });
  if (!p) return readLimen(id,owner);
  try {
    if (p.state === "new") {
      const rate = await api("/rate",config.key);
      if (rate.pair !== "THB/RUB" || rate.settlement_currency !== "THB" || decimal(rate.rate,8) <= BigInt(0) || !Number.isFinite(Date.parse(rate.valid_until)) || Date.parse(rate.valid_until) <= Date.now()) throw new Error("INVALID_RATE");
      const amount = thbAmount(p.total_thb);
      const cents = decimal(amount,2);
      if (cents < decimal(rate.min_thb,2) || cents > decimal(rate.max_thb,2) || cents + decimal(rate.daily_used_thb,2) > decimal(rate.daily_limit_thb,2)) throw new Error("PAYMENT_LIMIT");
      const saved = await query(`UPDATE limenthai_payments SET quoted_rate=$3,state='creating' WHERE subscription_id=$1 AND lease=$2 RETURNING subscription_id`,[id,lease,rate.rate]);
      if (!saved.rowCount) throw new Error("LEASE_LOST");
    }
    const raw = p.provider_id
      ? await api(`/orders/${encodeURIComponent(p.provider_id)}`,config.key)
      : await api("/orders",config.key,{partner_order_id:p.partner_id,amount_thb:thbAmount(p.total_thb),...(p.payer_phone?{payer_phone:p.payer_phone}:{})},p.partner_id);
    const order = validateOrder(raw,{partner_id:p.partner_id,amount_rub:p.amount_rub,amount_thb:thbAmount(p.total_thb),provider_id:p.provider_id,rate:p.provider_rate});
    const url = order.payment_url ? paymentUrl(order.payment_url) : null;
    const expires = order.expires_at && Number.isFinite(Date.parse(order.expires_at)) ? order.expires_at : null;
    if (!p.provider_id && order.status === "pending" && (!url || !expires)) throw new Error("INCOMPLETE_PAYMENT_DETAILS");
    const activated = await withTransaction(async client => {
      const s = await client.query(`SELECT status,payment_method,total_thb FROM subscriptions WHERE id=$1 FOR UPDATE`,[id]);
      const current = await client.query<Payment>(`SELECT * FROM limenthai_payments WHERE subscription_id=$1 FOR UPDATE`,[id]);
      const row = current.rows[0];
      if (!row || row.lease !== lease) return false;
      if (s.rows[0]?.payment_method !== "BANK_RU" || s.rows[0].total_thb !== row.total_thb) throw new Error("SUBSCRIPTION_MISMATCH");
      await client.query(`UPDATE limenthai_payments SET provider_id=$2,state=$3,provider_rate=$4,amount_rub=$5,payment_url=COALESCE($6,payment_url),expires_at=COALESCE($7,expires_at),lease=NULL,lease_until=NULL,last_error=NULL WHERE subscription_id=$1`,[id,order.order_id,order.status,order.rate,order.amount_rub,url,expires]);
      // Test payments never grant real meals, even with a paid test response.
      if (order.status !== "paid" || row.test || row.activated) return false;
      if (s.rows[0].status !== "AWAITING_ACTIVATION") throw new Error("SUBSCRIPTION_STATUS_MISMATCH");
      const code = createSubscriptionCode();
      await client.query(`UPDATE subscriptions SET status='ACTIVE',code=$2,activated_at=now(),paid_at=$3,updated_at=now() WHERE id=$1`,[id,code,order.paid_at]);
      await client.query(`UPDATE subscription_days SET status='AVAILABLE' WHERE subscription_id=$1 AND status='PLANNED'`,[id]);
      await client.query(`INSERT INTO manager_events(event_type,entity_id,payload) VALUES('SUBSCRIPTION_ACTIVATED',$1,$2::jsonb)`,[id,JSON.stringify({code,provider:"LimenThai",orderId:order.order_id,amountRub:order.amount_rub})]);
      await client.query(`UPDATE limenthai_payments SET activated=true WHERE subscription_id=$1`,[id]);
      return true;
    });
    if (activated) void notifyManagerTelegram({text:`Оплата LimenThai подтверждена. Подписка ${id}. Сумма ${p.total_thb} THB / ${order.amount_rub} RUB.`});
  } catch (error) {
    const code = error instanceof Error && /^[A-Z_0-9]+$/.test(error.message) ? error.message : "PROVIDER_UNAVAILABLE";
    await query(`UPDATE limenthai_payments SET lease=NULL,lease_until=NULL,last_error=$3 WHERE subscription_id=$1 AND lease=$2`,[id,lease,code]);
    throw new Error(code);
  }
  return readLimen(id,owner);
}
export async function readLimen(id:string,owner?:string) {
  const r = await query<Payment>(`SELECT p.* FROM limenthai_payments p JOIN subscriptions s ON s.id=p.subscription_id WHERE p.subscription_id=$1 AND ($2::uuid IS NULL OR s.user_id=$2::uuid)`,[id,owner||null]);
  const p=r.rows[0];if(!p)throw new Error("NOT_FOUND");
  if(p.contract_version!=="THB_V1")throw new Error("OLD_CONTRACT_REQUIRES_REVIEW");
  return {state:p.state,totalThb:p.total_thb,amountRub:p.amount_rub,rate:p.provider_rate,test:p.test,activated:p.activated,expiresAt:p.expires_at,paymentUrl:p.payment_url,qr:p.payment_url?await QRCode.toDataURL(paymentUrl(p.payment_url),{width:320,margin:2}):null};
}
let running=false;
export async function reconcileLimen() {
  if(running||!limenAvailable())return;
  running=true;
  try {
    const rows=await query<{subscription_id:string}>(`SELECT subscription_id FROM limenthai_payments WHERE contract_version='THB_V1' AND test=$1 AND state IN ('new','creating','pending') AND (checked_at IS NULL OR checked_at<now()-interval '30 seconds') ORDER BY checked_at ASC NULLS FIRST LIMIT 20`,[limenConfig().test]);
    for(const row of rows.rows){try{await syncLimen(row.subscription_id);}catch{console.error("LimenThai reconciliation needs retry",row.subscription_id);}}
  } catch {console.error("LimenThai reconciliation unavailable");} finally {running=false;}
}
