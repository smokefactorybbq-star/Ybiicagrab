import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { query, withTransaction } from "./db";

export const SESSION_COOKIE = "smoke_factory_session";
const SESSION_DAYS = 30;
const MAX_TELEGRAM_AUTH_AGE_SECONDS = 10 * 60;
export const TELEGRAM_LOGIN_STATE_COOKIE = "__Host-smokefactory_tg_state";
const TELEGRAM_LOGIN_STATE_MAX_AGE_SECONDS = 10 * 60;

export type TelegramIdentity = {
  id: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
};

export type AuthenticatedAccount = {
  userId: string;
  telegramId: string;
  username: string;
  fullName: string;
  phone: string;
  address: string;
  photoUrl: string;
  termsAcceptedAt: string | null;
};

function safeEqualHex(left: string, right: string) {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right) || left.length !== right.length) return false;
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, expectedHex] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
}

export function validateTelegramLoginPayload(params: URLSearchParams): TelegramIdentity {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");

  const receivedHash = params.get("hash") || "";
  const authDate = Number(params.get("auth_date") || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!receivedHash || !authDate || Math.abs(now - authDate) > MAX_TELEGRAM_AUTH_AGE_SECONDS) {
    throw new Error("Telegram login data expired");
  }

  const telegramFields = new Set(["id", "first_name", "last_name", "username", "photo_url", "auth_date"]);
  const entries = [...params.entries()]
    .filter(([key]) => telegramFields.has(key))
    .sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = createHash("sha256").update(token).digest();
  const expectedHash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (!safeEqualHex(receivedHash, expectedHash)) throw new Error("Invalid Telegram login signature");

  const id = params.get("id") || "";
  if (!/^\d+$/.test(id)) throw new Error("Invalid Telegram user id");
  return {
    id,
    username: params.get("username") || undefined,
    firstName: params.get("first_name") || undefined,
    lastName: params.get("last_name") || undefined,
    photoUrl: params.get("photo_url") || undefined
  };
}

export function validateTelegramWebAppInitData(initData: string): TelegramIdentity {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  if (!initData) throw new Error("Telegram initData is missing");

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash") || "";
  const authDate = Number(params.get("auth_date") || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!receivedHash || !authDate || Math.abs(now - authDate) > MAX_TELEGRAM_AUTH_AGE_SECONDS) {
    throw new Error("Telegram initData expired");
  }

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const expectedHash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (!safeEqualHex(receivedHash, expectedHash)) throw new Error("Invalid Telegram WebApp signature");

  const rawUser = params.get("user");
  if (!rawUser) throw new Error("Telegram user is missing");
  const user = JSON.parse(rawUser) as Record<string, unknown>;
  const id = String(user.id || "");
  if (!/^\d+$/.test(id)) throw new Error("Invalid Telegram user id");
  return {
    id,
    username: typeof user.username === "string" ? user.username : undefined,
    firstName: typeof user.first_name === "string" ? user.first_name : undefined,
    lastName: typeof user.last_name === "string" ? user.last_name : undefined,
    photoUrl: typeof user.photo_url === "string" ? user.photo_url : undefined
  };
}

export function createTelegramLoginState() {
  return randomBytes(32).toString("base64url");
}

export function setTelegramLoginStateCookie(response: NextResponse, state: string) {
  response.cookies.set({
    name: TELEGRAM_LOGIN_STATE_COOKIE,
    value: state,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: TELEGRAM_LOGIN_STATE_MAX_AGE_SECONDS
  });
}

export function clearTelegramLoginStateCookie(response: NextResponse) {
  response.cookies.set({
    name: TELEGRAM_LOGIN_STATE_COOKIE,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
}

export function verifyTelegramLoginState(request: NextRequest, suppliedState: string) {
  const cookieState = request.cookies.get(TELEGRAM_LOGIN_STATE_COOKIE)?.value || "";
  if (!cookieState || !suppliedState) return false;
  const a = Buffer.from(createHash("sha256").update(cookieState).digest("hex"), "hex");
  const b = Buffer.from(createHash("sha256").update(suppliedState).digest("hex"), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function upsertTelegramIdentity(identity: TelegramIdentity) {
  const fullName = [identity.firstName, identity.lastName].filter(Boolean).join(" ").trim() || "Пользователь Smoke Factory";
  const result = await query<{
    id: string; telegram_id: string; username: string | null; full_name: string; phone: string | null; address: string | null; photo_url: string | null;
  }>(
    `INSERT INTO users (
       telegram_id, username, telegram_username, telegram_first_name, telegram_last_name,
       full_name, photo_url, avatar_url, role, created_at, updated_at, last_site_visit_at
     ) VALUES ($1,$2,$2,$3,$4,$5,$6,$6,'CUSTOMER',now(),now(),now())
     ON CONFLICT (telegram_id) DO UPDATE SET
       username = COALESCE(EXCLUDED.username, users.username),
       telegram_username = COALESCE(EXCLUDED.telegram_username, users.telegram_username),
       telegram_first_name = COALESCE(EXCLUDED.telegram_first_name, users.telegram_first_name),
       telegram_last_name = COALESCE(EXCLUDED.telegram_last_name, users.telegram_last_name),
       full_name = CASE WHEN users.full_name IS NULL OR users.full_name = '' OR users.full_name = 'Пользователь Smoke Factory'
                        THEN EXCLUDED.full_name ELSE users.full_name END,
       photo_url = COALESCE(EXCLUDED.photo_url, users.photo_url),
       avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
       updated_at = now(), last_site_visit_at = now()
     RETURNING id::text, telegram_id::text, username, full_name, phone, address, photo_url`,
    [identity.id, identity.username || null, identity.firstName || null, identity.lastName || null, fullName, identity.photoUrl || null]
  );
  return result.rows[0];
}

export async function createBrowserSession(userId: string) {
  const token = createSessionToken();
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM customer_sessions WHERE expires_at <= now()`);
    await client.query(
      `INSERT INTO customer_sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`,
      [userId, hashSessionToken(token)]
    );
    await client.query(
      `INSERT INTO customer_accounts (user_id, phone, password_hash)
       SELECT id, phone, '' FROM users WHERE id = $1
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
  });
  return token;
}

export async function getAuthenticatedAccount(request: NextRequest): Promise<AuthenticatedAccount | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value || "";
  if (!token) return null;

  const result = await query<AuthenticatedAccount & { sessionId: string }>(
    `SELECT cs.id::text AS "sessionId", u.id::text AS "userId", u.telegram_id::text AS "telegramId",
            COALESCE(u.username, u.telegram_username, '') AS username,
            COALESCE(NULLIF(u.profile_name,''), NULLIF(u.full_name,''), 'Пользователь Smoke Factory') AS "fullName",
            COALESCE(u.phone, '') AS phone, COALESCE(u.address, '') AS address,
            COALESCE(u.photo_url, u.avatar_url, '') AS "photoUrl",
            ca.terms_accepted_at::text AS "termsAcceptedAt"
     FROM customer_sessions cs
     JOIN users u ON u.id = cs.user_id
     LEFT JOIN customer_accounts ca ON ca.user_id = u.id
     WHERE cs.token_hash = $1 AND cs.expires_at > now()
     LIMIT 1`,
    [hashSessionToken(token)]
  );
  const row = result.rows[0];
  if (!row) return null;
  void query(`UPDATE customer_sessions SET last_used_at = now() WHERE id = $1`, [row.sessionId]);
  return {
    userId: row.userId,
    telegramId: row.telegramId,
    username: row.username,
    fullName: row.fullName,
    phone: row.phone,
    address: row.address,
    photoUrl: row.photoUrl,
    termsAcceptedAt: row.termsAcceptedAt
  };
}
