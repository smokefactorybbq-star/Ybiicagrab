import { NextRequest, NextResponse } from "next/server";
import { clientIp, consumeRateLimit } from "../../../../lib/rate-limit";
import { isSameOriginMutation } from "../../../../lib/request-security";
import { createStaffSession, setStaffSessionCookie, StaffRole, validateStaffCredentials } from "../../../../lib/staff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = new Set<StaffRole>(["MANAGER", "KITCHEN", "COURIER"]);

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ ok: false, error: "Недопустимый источник запроса" }, { status: 403 });
  try {
    const body = await request.json() as { role?: unknown; username?: unknown; password?: unknown };
    const role = String(body.role || "").toUpperCase() as StaffRole;
    const username = typeof body.username === "string" ? body.username.trim().slice(0, 120) : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!ROLES.has(role) || !username || !password) return NextResponse.json({ ok: false, error: "Введите логин и пароль" }, { status: 400 });

    const ip = clientIp(request);
    const limiter = await consumeRateLimit(`staff-login:${role}:${ip}:${username.toLowerCase()}`, 5, 10 * 60);
    if (!limiter.allowed) {
      return NextResponse.json({ ok: false, error: "Слишком много попыток входа. Попробуйте позже." }, {
        status: 429,
        headers: { "Retry-After": String(limiter.retryAfterSeconds) }
      });
    }

    const validated = validateStaffCredentials(role, username, password);
    if (!validated.ok) return NextResponse.json({ ok: false, error: validated.error }, { status: validated.status });
    const token = await createStaffSession(role, username);
    const response = NextResponse.json({ ok: true, role });
    setStaffSessionCookie(response, token);
    return response;
  } catch (error) {
    console.error("Staff login failed", error);
    return NextResponse.json({ ok: false, error: "Не удалось выполнить вход" }, { status: 500 });
  }
}
