import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type TelegramLoginData = {
  id: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: string;
  hash: string;
};

const MAX_AUTH_AGE_SECONDS = 15 * 60;

export function parseAndVerifyTelegramLogin(url: URL): TelegramLoginData {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) throw new Error("TELEGRAM_NOT_CONFIGURED");

  const data: Record<string, string> = {};
  // Telegram signs every returned field except `hash`. Keep unknown fields in
  // the data-check-string too, so authentication remains valid if Telegram adds
  // optional callback fields (for example allows_write_to_pm).
  for (const [key, value] of url.searchParams.entries()) {
    if (key === "hash" || key === "state") continue;
    if (key in data) throw new Error("BAD_TELEGRAM_AUTH");
    data[key] = value;
  }

  const hash = (url.searchParams.get("hash") || "").trim().toLowerCase();
  if (!hash || !/^[a-f0-9]{64}$/.test(hash)) throw new Error("BAD_TELEGRAM_AUTH");
  if (!/^\d+$/.test(data.id || "") || !/^\d+$/.test(data.auth_date || "")) throw new Error("BAD_TELEGRAM_AUTH");

  const authDate = Number(data.auth_date);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authDate) || authDate > now + 60 || now - authDate > MAX_AUTH_AGE_SECONDS) {
    throw new Error("TELEGRAM_AUTH_EXPIRED");
  }

  const dataCheckString = Object.entries(data)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHash("sha256").update(token).digest();
  const expected = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  const suppliedBuffer = Buffer.from(hash, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    throw new Error("BAD_TELEGRAM_AUTH");
  }

  return {
    id: data.id,
    first_name: data.first_name || "",
    last_name: data.last_name || "",
    username: data.username || "",
    photo_url: data.photo_url || "",
    auth_date: data.auth_date,
    hash
  };
}
