import { NextRequest, NextResponse } from "next/server";
import { isSameOriginMutation } from "../../../../lib/request-security";
import { clearStaffSessionCookie, revokeStaffSession } from "../../../../lib/staff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ ok: false, error: "Недопустимый источник запроса" }, { status: 403 });
  await revokeStaffSession(request).catch(() => undefined);
  const response = NextResponse.json({ ok: true });
  clearStaffSessionCookie(response);
  return response;
}
