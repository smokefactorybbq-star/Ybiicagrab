import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAccount, normalizeContactPhone } from "../../../../lib/auth";
import { withTransaction } from "../../../../lib/db";
import { isSameOriginMutation } from "../../../../lib/request-security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function PATCH(request: NextRequest) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ok:false,error:"Недопустимый источник запроса"},{status:403});
  const account = await getAuthenticatedAccount(request);
  if (!account) return NextResponse.json({ok:false,error:"Требуется вход"},{status:401});
  try {
    const body = await request.json();
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const rawPhone = typeof body.phone === "string" ? body.phone.trim() : account.phone;
    const phone = normalizeContactPhone(rawPhone);
    const address = typeof body.address === "string" ? body.address.trim() : "";
    if (fullName.length < 2 || fullName.length > 120 || address.length > 1000 || (rawPhone && !phone)) return NextResponse.json({ok:false,error:"Проверьте имя (2–120 символов), телефон и адрес (до 1000 символов)"},{status:400});
    // Contact phone is not proof of identity. Never merge accounts here.
    await withTransaction(async client => {
      await client.query(`UPDATE users SET full_name=$1,profile_name=$1,phone=$2,address=$3,updated_at=now() WHERE id=$4`,[fullName,phone || null,address,account.userId]);
      await client.query(`INSERT INTO customer_accounts (user_id,phone,password_hash) VALUES ($1,$2,'') ON CONFLICT (user_id) DO UPDATE SET phone=EXCLUDED.phone,updated_at=now()`,[account.userId,phone || null]);
    });
    return NextResponse.json({ok:true,account:{...account,fullName,phone,address}});
  } catch (error) {
    console.error("Profile update failed",error);
    return NextResponse.json({ok:false,error:"Не удалось сохранить профиль"},{status:500});
  }
}
