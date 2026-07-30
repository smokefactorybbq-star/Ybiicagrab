import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { query } from "./db";
import { normalizePhone } from "./subscriptions";

export const SESSION_COOKIE = "mealpoint_session";
const SESSION_DAYS = 90;

export type AuthenticatedAccount = {
  userId: string;
  fullName: string;
  phone: string;
  address: string;
  termsAcceptedAt: string | null;
};

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

export async function getAuthenticatedAccount(request: NextRequest): Promise<AuthenticatedAccount | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value || "";
  if (!token) return null;

  const result = await query<AuthenticatedAccount & { session_id: string }>(
    `SELECT
       cs.id AS session_id,
       u.id AS "userId",
       u.full_name AS "fullName",
       COALESCE(ca.phone, u.phone, '') AS phone,
       COALESCE(u.address, '') AS address,
       ca.terms_accepted_at::text AS "termsAcceptedAt"
     FROM customer_sessions cs
     JOIN customer_accounts ca ON ca.user_id = cs.user_id
     JOIN users u ON u.id = cs.user_id
     WHERE cs.token_hash = $1
       AND cs.expires_at > now()
     LIMIT 1`,
    [hashSessionToken(token)]
  );

  const account = result.rows[0];
  if (!account) return null;
  void query(`UPDATE customer_sessions SET last_used_at = now() WHERE id = $1`, [account.session_id]);
  return {
    userId: account.userId,
    fullName: account.fullName,
    phone: normalizePhone(account.phone),
    address: account.address,
    termsAcceptedAt: account.termsAcceptedAt
  };
}
