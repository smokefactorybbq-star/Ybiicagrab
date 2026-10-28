import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type TelegramMiniAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
};

export function getTelegramLoginBotToken() {
  const token = (process.env.TELEGRAM_LOGIN_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) throw new Error("TELEGRAM_LOGIN_BOT_NOT_CONFIGURED");
  return token;
}

export async function getTelegramLoginBotInfo() {
  const token = getTelegramLoginBotToken();
  const configuredUsername = (process.env.TELEGRAM_LOGIN_BOT_USERNAME || process.env.TELEGRAM_BOT_USERNAME || process.env.BOT_USERNAME || "")
    .trim().replace(/^@/, "");
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, { cache: "no-store" });
    const data = await response.json() as { ok?: boolean; result?: { username?: string; has_main_web_app?: boolean } };
    if (response.ok && data.ok && data.result?.username) {
      return {
        username: data.result.username.replace(/^@/, ""),
        hasMainWebApp: Boolean(data.result.has_main_web_app)
      };
    }
  } catch (error) {
    console.error("Telegram login bot getMe failed", error);
  }
  if (configuredUsername) return { username: configuredUsername, hasMainWebApp: false };
  throw new Error("TELEGRAM_LOGIN_BOT_NOT_CONFIGURED");
}

export function hashTelegramLoginToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyTelegramMiniAppInitData(initData: string, maxAgeSeconds = 10 * 60) {
  const token = getTelegramLoginBotToken();
  const params = new URLSearchParams(String(initData || ""));
  const receivedHash = (params.get("hash") || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(receivedHash)) throw new Error("BAD_TELEGRAM_MINIAPP_HASH");

  const entries = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([key, value]) => `${key}=${value}`).join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
  const calculatedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  const a = Buffer.from(receivedHash, "hex");
  const b = Buffer.from(calculatedHash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("BAD_TELEGRAM_MINIAPP_HASH");

  const authDate = Number(params.get("auth_date") || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authDate) || authDate <= 0 || Math.abs(now - authDate) > maxAgeSeconds) {
    throw new Error("TELEGRAM_MINIAPP_EXPIRED");
  }

  const rawUser = params.get("user") || "";
  let user: TelegramMiniAppUser;
  try { user = JSON.parse(rawUser) as TelegramMiniAppUser; } catch { throw new Error("BAD_TELEGRAM_MINIAPP_USER"); }
  if (!user || !Number.isSafeInteger(Number(user.id)) || Number(user.id) <= 0) throw new Error("BAD_TELEGRAM_MINIAPP_USER");

  return {
    user: { ...user, id: Number(user.id) },
    authDate,
    startParam: params.get("start_param") || ""
  };
}
