import crypto from "node:crypto";

function safeHexEqual(received: string, expected: string) {
  try {
    const a = Buffer.from(received, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function botToken() {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return token;
}

export function verifyLoyaltyRequest(body: Record<string, unknown>, timestamp: string, signature: string) {
  if (!timestamp || !signature) throw new Error("Loyalty signature is missing");
  const ts = Number(timestamp);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 300) throw new Error("Loyalty request expired");

  const payload = [
    String(body.telegramId || ""),
    String(body.orderRef || ""),
    String(Number(body.itemsTotal || 0)),
    String(Number(body.delivery || 0)),
    String(Number(body.requestedBonus || 0)),
    String(timestamp)
  ].join("|");

  const expected = crypto.createHmac("sha256", botToken()).update(payload).digest("hex");
  if (!safeHexEqual(signature, expected)) throw new Error("Invalid loyalty signature");
}

export function verifyBonusRequest(input: {
  telegramId: string;
  amount: number;
  managerId: number;
  timestamp: number;
  requestId: string;
  signature: string;
}) {
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(input.timestamp) || Math.abs(now - input.timestamp) > 300) {
    throw new Error("BONUS_EXPIRED");
  }
  const payload = JSON.stringify({
    amount: input.amount,
    managerId: input.managerId,
    requestId: input.requestId,
    telegramId: String(input.telegramId),
    timestamp: input.timestamp
  });
  const expected = crypto.createHmac("sha256", botToken()).update(payload).digest("hex");
  if (!safeHexEqual(input.signature, expected)) throw new Error("BONUS_SIGNATURE");
}
