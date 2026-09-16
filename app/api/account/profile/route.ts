import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAccount, normalizeContactPhone } from "../../../../lib/auth";
import { withTransaction } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const account = await getAuthenticatedAccount(request);
  if (!account) return NextResponse.json({ ok: false, error: "Требуется вход" }, { status: 401 });

  try {
    const body = await request.json() as { fullName?: unknown; phone?: unknown; address?: unknown };
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const rawPhone = typeof body.phone === "string" ? body.phone.trim() : account.phone;
    const phone = rawPhone ? normalizeContactPhone(rawPhone) : "";
    const address = typeof body.address === "string" ? body.address.trim() : "";

    if (fullName.length < 2) return NextResponse.json({ ok: false, error: "Укажите имя" }, { status: 400 });
    if (rawPhone && !phone) return NextResponse.json({ ok: false, error: "Введите корректный телефон" }, { status: 400 });

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE users SET full_name = $1, profile_name = $1, phone = $2, address = $3, updated_at = now() WHERE id = $4`,
        [fullName, phone, address, account.userId]
      );
      await client.query(
        `UPDATE customer_accounts SET phone = $1, updated_at = now() WHERE user_id = $2`,
        [phone, account.userId]
      );
    });

    return NextResponse.json({ ok: true, account: { ...account, fullName, phone, address } });
  } catch (error) {
    console.error("Profile update failed", error);
    return NextResponse.json({ ok: false, error: "Не удалось сохранить профиль" }, { status: 500 });
  }
}
