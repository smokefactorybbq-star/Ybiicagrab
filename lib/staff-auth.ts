import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { query } from "./db";

export type StaffRole = "MANAGER" | "KITCHEN" | "COURIER";

export const STAFF_SESSION_COOKIE = "__Host-mealpoint_staff";
const STAFF_SESSION_HOURS = 12;

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function constantTimeStringEqual(left: string, right: string) {
  const a = Buffer.from(hash(left), "hex");
  const b = Buffer.from(hash(right), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function credentialsFor(role: StaffRole) {
  if (role === "MANAGER") {
    return {
      username: (process.env.MANAGER_USERNAME || "manager").trim(),
      password: (process.env.MANAGER_PASSWORD || "").trim()
    };
  }
  if (role === "KITCHEN") {
    return {
      username: (process.env.KITCHEN_USERNAME || "kitchen").trim(),
      password: (process.env.KITCHEN_PASSWORD || "").trim()
    };
  }
  return {
    username: (process.env.COURIER_USERNAME || "courier").trim(),
    password: (process.env.COURIER_PASSWORD || "").trim()
  };
}

export function validateStaffCredentials(role: StaffRole, username: string, password: string) {
  const expected = credentialsFor(role);
  if (!expected.password) return { ok: false as const, status: 503, error: `Пароль для ${role.toLowerCase()} не настроен` };
  const ok = constantTimeStringEqual(username.trim(), expected.username) && constantTimeStringEqual(password, expected.password);
  if (!ok) return { ok: false as const, status: 401, error: "Неверный логин или пароль" };
  return { ok: true as const, status: 200, error: "" };
}

export async function createStaffSession(role: StaffRole, username: string) {
  const token = randomBytes(32).toString("base64url");
  await query(`DELETE FROM staff_sessions WHERE expires_at <= now()`);
  await query(
    `INSERT INTO staff_sessions (role, username, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + interval '${STAFF_SESSION_HOURS} hours')`,
    [role, username.slice(0, 120), hash(token)]
  );
  return token;
}

export function setStaffSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: STAFF_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: STAFF_SESSION_HOURS * 60 * 60
  });
}

export function clearStaffSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: STAFF_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0
  });
}

function cookieValue(request: Request, name: string) {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      const value = rest.join("=");
      try { return decodeURIComponent(value); } catch { return value; }
    }
  }
  return "";
}

export async function authorizeStaff(request: Request, allowedRoles: StaffRole[]) {
  const token = cookieValue(request, STAFF_SESSION_COOKIE);
  if (!token) return { ok: false as const, status: 401, error: "Требуется вход" };
  const result = await query<{ id: string; role: StaffRole; username: string }>(
    `SELECT id::text, role, username
     FROM staff_sessions
     WHERE token_hash = $1 AND expires_at > now()
     LIMIT 1`,
    [hash(token)]
  );
  const row = result.rows[0];
  if (!row || !allowedRoles.includes(row.role)) return { ok: false as const, status: 403, error: "Недостаточно прав" };
  void query(`UPDATE staff_sessions SET last_used_at = now() WHERE id = $1`, [row.id]);
  return { ok: true as const, status: 200, error: "", role: row.role, username: row.username };
}

export async function revokeStaffSession(request: NextRequest) {
  const token = request.cookies.get(STAFF_SESSION_COOKIE)?.value || "";
  if (token) await query(`DELETE FROM staff_sessions WHERE token_hash = $1`, [hash(token)]);
}
