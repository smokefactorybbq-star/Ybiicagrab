import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { query, withTransaction } from "./db";
import { createSubscriptionCode } from "./subscriptions";
import { notifyManagerTelegram } from "./telegram";
import { decimal, thbAmount, paymentUrl, validateOrder, validateQuote } from "./limenthai-contract";

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
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const known = new Set(["invalid_request","invalid_api_key","ip_not_allowed","partner_disabled","order_not_found","daily_limit_exceeded","duplicate_partner_order_id","rate_limited","payment_unavailable","amount_too_small","amount_too_large","payer_phone_required"]);
    const providerCode = typeof data?.error?.code === "string" && known.has(data.error.code) ? data.error.code.toUpperCase() : "UNKNOWN";
    throw new Error(`LIMENTHAI_HTTP_${response.status}_${providerCode}`);
  }
  return response.json();
}
type Payment = {subscription_id:string;partner_id:string;provider_id:string|null;amount_rub:string|null;total_thb:number;contract_version:string;payer_phone:string|null;provider_rate:string|null;test:boolean;state:string;payment_url:string|null;expires_at:string|null;lease:string|null;activated:boolean};
export async function syncLimen(id: string, owner?: string, acceptedRub?: string) {
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
    // Viewing the modal or background polling must not create a payment.
    if (row.state === "new" && acceptedRub === undefined) return null;
    const acquired = await client.query(`UPDATE limenthai_payments SET lease=$2,lease_until=now()+interval '45 seconds',checked_at=now() WHERE subscription_id=$1 AND (lease_until IS NULL OR lease_until<now()) RETURNING subscription_id`,[id,lease]);
    return acquired.rowCount ? row : null;
  });
  if (!p) return readLimen(id,owner);
  try {
    if (p.state === "new") {
      const quote = validateQuote(await api(`/quote?amount_thb=${encodeURIComponent(thbAmount(p.total_thb))}`,config.key),thbAmount(p.total_thb));
      if (acceptedRub === undefined || decimal(acceptedRub,2) !== decimal(quote.amount_rub,2)) throw new Error("PRICE_CHANGED");
      const saved = await query(`UPDATE limenthai_payments SET quoted_rate=$3,state='creating' WHERE subscription_id=$1 AND lease=$2 RETURNING subscription_id`,[id,lease,quote.rate]);
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
    if (activated) void notifyManagerTelegram({text:`РћРїР»Р°С‚Р° LimenThai РїРѕРґС‚РІРµСЂР¶РґРµРЅР°. РџРѕРґРїРёСЃРєР° ${id}. РЎСѓРјРјР° ${p.total_thb} THB / ${order.amount_rub} RUB.`});
  } catch (error) {
    const code = limenErrorCode(error);
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
    const rows=await query<{subscription_id:string}>(`SELECT subscription_id FROM limenthai_payments WHERE contract_version='THB_V1' AND test=$1 AND state IN ('creating','pending') AND (checked_at IS NULL OR checked_at<now()-interval '30 seconds') ORDER BY checked_at ASC NULLS FIRST LIMIT 20`,[limenConfig().test]);
    for(const row of rows.rows){try{await syncLimen(row.subscription_id);}catch(error){console.error("LimenThai reconciliation needs retry",row.subscription_id,limenErrorCode(error));}}
  } catch(error) {console.error("LimenThai reconciliation unavailable",limenErrorCode(error));} finally {running=false;}
}

// Only documented/locally defined codes can leave the server. Never log API keys,
// full provider responses, customer phones, or arbitrary upstream messages.
export function limenErrorCode(error: unknown): string {
  const known = new Set(["LIMENTHAI_NOT_CONFIGURED","NOT_FOUND","LEGACY_PAYMENT","OLD_CONTRACT_REQUIRES_REVIEW","PAYMENT_MODE_MISMATCH","TOTAL_CHANGED","INVALID_QUOTE","PRICE_CHANGED","LEASE_LOST","ORDER_MISMATCH","PAYMENT_MISMATCH","INVALID_DECIMAL","DECIMAL_PRECISION","INVALID_TOTAL","INVALID_PAID_AT","INVALID_PAYMENT_URL","INCOMPLETE_PAYMENT_DETAILS","SUBSCRIPTION_MISMATCH","SUBSCRIPTION_STATUS_MISMATCH"]);
  const e = error as {message?:unknown;code?:unknown;name?:unknown};
  if (typeof e?.message === "string" && (known.has(e.message) || /^LIMENTHAI_HTTP_[1-5][0-9]{2}_(UNKNOWN|INVALID_REQUEST|INVALID_API_KEY|IP_NOT_ALLOWED|PARTNER_DISABLED|ORDER_NOT_FOUND|DAILY_LIMIT_EXCEEDED|DUPLICATE_PARTNER_ORDER_ID|RATE_LIMITED|PAYMENT_UNAVAILABLE|AMOUNT_TOO_SMALL|AMOUNT_TOO_LARGE|PAYER_PHONE_REQUIRED)$/.test(e.message))) return e.message;
  if (e?.code === "42P01" || e?.code === "42703") return "DATABASE_MIGRATION_REQUIRED";
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return "LIMENTHAI_TIMEOUT";
  return "PROVIDER_UNAVAILABLE";
}
export function limenErrorMessage(code: string) {
  if (code === "PRICE_CHANGED") return "Курс изменился. Обновите сумму и нажмите «Оплатить» ещё раз.";
  if (code.includes("401") || code.includes("INVALID_API_KEY")) return "LimenThai отклонил API-ключ. Сообщите менеджеру.";
  if (code.includes("IP_NOT_ALLOWED")) return "LimenThai не разрешил доступ с адреса сервера. Сообщите менеджеру.";
  if (code.includes("PARTNER_DISABLED")) return "Приём платежей LimenThai для магазина приостановлен.";
  if (code.includes("AMOUNT_TOO") || code.includes("DAILY_LIMIT")) return "Сумма выходит за доступные лимиты LimenThai. Обратитесь к менеджеру.";
  if (code === "LIMENTHAI_NOT_CONFIGURED" || code === "PAYMENT_MODE_MISMATCH") return "Оплата LimenThai не настроена для этого режима. Сообщите менеджеру.";
  if (code === "OLD_CONTRACT_REQUIRES_REVIEW") return "Эта заявка создана старой версией оплаты. Менеджеру нужно сверить её с LimenThai.";
  if (code === "DATABASE_MIGRATION_REQUIRED") return "Не завершено обновление базы платежей. Сообщите менеджеру.";
  if (code.includes("PAYER_PHONE_REQUIRED")) return "LimenThai требует телефон плательщика. Обратитесь к менеджеру.";
  return "Не удалось получить ответ об оплате. Повторите запрос позже. Если уже оплатили, не переводите деньги повторно.";
}
export async function quoteLimen(id: string, owner: string) {
  const config = limenConfig();
  const payment = await readLimen(id,owner);
  if (payment.test !== config.test) throw new Error("PAYMENT_MODE_MISMATCH");
  if (payment.state !== "new") return payment;
  const quote = validateQuote(await api(`/quote?amount_thb=${encodeURIComponent(thbAmount(payment.totalThb))}`,config.key),thbAmount(payment.totalThb));
  return {...payment,amountRub:quote.amount_rub,rate:quote.rate,quoteExpiresAt:quote.valid_until};
}
