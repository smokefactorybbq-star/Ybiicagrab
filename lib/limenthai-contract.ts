// Contract transcribed from the supplied LimenThai documentation screenshots.
export function decimal(value: unknown, scale: number): bigint {
  if (typeof value !== "string" || !/^\d{1,12}(\.\d{1,8})?$/.test(value)) throw new Error("INVALID_DECIMAL");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > scale && /[1-9]/.test(fraction.slice(scale))) throw new Error("DECIMAL_PRECISION");
  return BigInt(whole) * BigInt(10) ** BigInt(scale) + BigInt(fraction.slice(0, scale).padEnd(scale, "0") || "0");
}
export function thbAmount(total: number): string {
  if (!Number.isSafeInteger(total) || total <= 0) throw new Error("INVALID_TOTAL");
  return `${total}.00`;
}
export function paymentUrl(value: unknown, testMode = false): string {
  if (typeof value !== "string") throw new Error("INVALID_PAYMENT_URL");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("INVALID_PAYMENT_URL"); }
  const allowed = new Set(["qr.nspk.ru"]);
  for (const host of (process.env.LIMENTHAI_PAYMENT_HOSTS || "").split(",")) {
    const normalized = host.trim().toLowerCase();
    // Exact DNS hosts only: no wildcard, paths, ports, or numeric IP addresses.
    if (/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(normalized)) allowed.add(normalized);
  }
  const sandbox = url.hostname === "api.limenthai.com" && /^\/partner-api\/sandbox\/ord_[a-zA-Z0-9_-]+\/?$/.test(url.pathname);
  // User supplied this exact provider sandbox route. It is never a live payment.
  if (sandbox && !testMode) throw new Error("INVALID_PAYMENT_URL");
  if (url.protocol !== "https:" || (!allowed.has(url.hostname) && !(testMode && sandbox)) || url.port || url.username || url.password) throw new Error("INVALID_PAYMENT_URL");
  return url.href;
}
/** Log only a DNS hostname. Paths and query strings can contain payment tokens. */
export function paymentHost(value: unknown): string {
  try {
    const url = new URL(typeof value === "string" ? value : "");
    return /^[a-z0-9.-]{1,253}$/i.test(url.hostname) ? url.hostname : "unavailable";
  } catch { return "unavailable"; }
}
export type ProviderOrder = {order_id:string;partner_order_id:string;status:string;amount_rub:string;rate:string;amount_thb:string;settlement_currency:string;payment_url?:string;expires_at?:string;paid_at?:string};
export function validateOrder(raw: unknown, expected: {partner_id:string;amount_rub:string|null;amount_thb:string;provider_id:string|null;rate?:string|null}): ProviderOrder {
  const o = raw as ProviderOrder;
  if (!o || typeof o.order_id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(o.order_id) || o.partner_order_id !== expected.partner_id || (expected.provider_id && o.order_id !== expected.provider_id)) throw new Error("ORDER_MISMATCH");
  if (!["pending","paid","expired","declined"].includes(o.status) || (expected.amount_rub !== null && decimal(o.amount_rub,2) !== decimal(expected.amount_rub,2)) || decimal(o.amount_rub,2) <= BigInt(0) || decimal(o.rate,8) <= BigInt(0) || o.settlement_currency !== "THB" || decimal(o.amount_thb,2) !== decimal(expected.amount_thb,2) || (expected.rate != null && decimal(o.rate,8) !== decimal(expected.rate,8))) throw new Error("PAYMENT_MISMATCH");
  if (o.status === "paid" && (typeof o.paid_at !== "string" || !Number.isFinite(Date.parse(o.paid_at)))) throw new Error("INVALID_PAID_AT");
  return o;
}

export function validateQuote(raw: unknown, amountThb: string) {
  const q = raw as {amount_thb:string;amount_rub:string;rate:string;unit:string;valid_until:string};
  if (!q || decimal(q.amount_thb,2) !== decimal(amountThb,2) || decimal(q.amount_rub,2) <= BigInt(0) || decimal(q.rate,8) <= BigInt(0) || q.unit !== "RUB за 1 THB" || typeof q.valid_until !== "string" || !Number.isFinite(Date.parse(q.valid_until)) || Date.parse(q.valid_until) <= Date.now()) throw new Error("INVALID_QUOTE");
  return q;
}

export function assertLimenManualActivation(payment: {state:string;test:boolean;provider_id:string|null;contract_version:string;total_thb:number}|undefined, totalThb:number) {
  if (!payment) return; // Other payment methods and legacy manual BANK_RU.
  if (payment.test || payment.state !== "paid" || !payment.provider_id || payment.contract_version !== "THB_V1" || payment.total_thb !== totalThb) throw new Error("LIMENTHAI_PAYMENT_NOT_RECEIVED");
}
