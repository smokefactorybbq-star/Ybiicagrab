import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { query, withTransaction } from "./db";

export const SESSION_COOKIE = "mealpoint_session";
const SESSION_DAYS = 30;

export type AuthenticatedAccount = {
  userId: string;
  fullName: string;
  phone: string;
  address: string;
  photoUrl: string;
  termsAcceptedAt: string | null;
};

/**
 * Backward-compatibility only for repositories where an old password route
 * was not deleted during an overlay deploy. The current customer UI uses
 * phone + SMS OTP and does not call password registration/login routes.
 */
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, expectedHex] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex || !/^[a-f0-9]+$/i.test(expectedHex)) return false;
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

export async function createBrowserSession(userId: string) {
  const token = createSessionToken();
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM customer_sessions WHERE expires_at <= now()`);
    await client.query(
      `INSERT INTO customer_sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`,
      [userId, hashSessionToken(token)]
    );
  });
  return token;
}

export async function getOrCreatePhoneAccount(phone: string) {
  return withTransaction(async (client) => {
    const existing = await client.query<{ user_id: string }>(
      `SELECT u.id::text AS user_id
       FROM users u
       LEFT JOIN customer_accounts ca ON ca.user_id = u.id
       WHERE ca.phone = $1 OR u.phone = $1
       ORDER BY CASE WHEN ca.phone = $1 THEN 0 ELSE 1 END, u.created_at ASC
       LIMIT 1`,
      [phone]
    );
    if (existing.rows[0]?.user_id) {
      const userId = existing.rows[0].user_id;
      await client.query(`UPDATE users SET phone = $1, updated_at = now(), last_site_visit_at = now() WHERE id = $2`, [phone, userId]);
      await client.query(
        `INSERT INTO customer_accounts (user_id, phone, password_hash)
         VALUES ($1, $2, '')
         ON CONFLICT (user_id) DO UPDATE SET phone = EXCLUDED.phone, updated_at = now()`,
        [userId, phone]
      );
      return userId;
    }

    const created = await client.query<{ id: string }>(
      `INSERT INTO users (phone, full_name, role, created_at, updated_at, last_site_visit_at)
       VALUES ($1, 'Пользователь MealPoint', 'CUSTOMER', now(), now(), now())
       RETURNING id::text`,
      [phone]
    );
    const userId = created.rows[0].id;
    await client.query(
      `INSERT INTO customer_accounts (user_id, phone, password_hash)
       VALUES ($1, $2, '')`,
      [userId, phone]
    );
    return userId;
  });
}

export async function getAuthenticatedAccount(request: NextRequest): Promise<AuthenticatedAccount | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value || "";
  if (!token) return null;

  const result = await query<AuthenticatedAccount & { sessionId: string }>(
    `SELECT cs.id::text AS "sessionId", u.id::text AS "userId",
            COALESCE(NULLIF(u.profile_name,''), NULLIF(u.full_name,''), 'Пользователь MealPoint') AS "fullName",
            COALESCE(ca.phone, u.phone, '') AS phone,
            COALESCE(u.address, '') AS address,
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
    fullName: row.fullName,
    phone: row.phone,
    address: row.address,
    photoUrl: row.photoUrl,
    termsAcceptedAt: row.termsAcceptedAt
  };
}
