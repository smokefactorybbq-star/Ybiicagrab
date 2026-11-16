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
export function paymentUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("INVALID_PAYMENT_URL");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "qr.nspk.ru" || url.port || url.username || url.password) throw new Error("INVALID_PAYMENT_URL");
  return url.href;
}
export type ProviderOrder = {order_id:string;partner_order_id:string;status:string;amount_rub:string;rate:string;amount_thb:string;settlement_currency:string;payment_url?:string;expires_at?:string;paid_at?:string};
export function validateOrder(raw: unknown, expected: {partner_id:string;amount_rub:string|null;amount_thb:string;provider_id:string|null;rate?:string|null}): ProviderOrder {
  const o = raw as ProviderOrder;
  if (!o || typeof o.order_id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(o.order_id) || o.partner_order_id !== expected.partner_id || (expected.provider_id && o.order_id !== expected.provider_id)) throw new Error("ORDER_MISMATCH");
  if (!["pending","paid","expired","declined"].includes(o.status) || (expected.amount_rub !== null && decimal(o.amount_rub,2) !== decimal(expected.amount_rub,2)) || decimal(o.amount_rub,2) <= BigInt(0) || decimal(o.rate,8) <= BigInt(0) || o.settlement_currency !== "THB" || decimal(o.amount_thb,2) !== decimal(expected.amount_thb,2) || (expected.rate != null && decimal(o.rate,8) !== decimal(expected.rate,8))) throw new Error("PAYMENT_MISMATCH");
  if (o.status === "paid" && (typeof o.paid_at !== "string" || !Number.isFinite(Date.parse(o.paid_at)))) throw new Error("INVALID_PAID_AT");
  return o;
}
