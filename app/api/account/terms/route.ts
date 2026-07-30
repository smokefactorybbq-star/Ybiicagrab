import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAccount } from "../../../../lib/auth";
import { query } from "../../../../lib/db";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const account = await getAuthenticatedAccount(request);
  if (!account) return NextResponse.json({ ok: false, error: "Требуется вход" }, { status: 401 });

  const body = await request.json() as { accepted?: unknown };
  if (body.accepted !== true) return NextResponse.json({ ok: false, error: "Необходимо принять правила" }, { status: 400 });

  const result = await query<{ terms_accepted_at: string }>(
    `UPDATE customer_accounts
     SET terms_accepted_at = now(), terms_version = '2026-07-30', updated_at = now()
     WHERE user_id = $1
     RETURNING terms_accepted_at::text`,
    [account.userId]
  );
  return NextResponse.json({ ok: true, termsAcceptedAt: result.rows[0]?.terms_accepted_at || new Date().toISOString() });
}
