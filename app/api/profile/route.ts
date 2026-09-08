import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAccount } from "../../../lib/auth";
import { getShopAccountData } from "../../../lib/shop-account";
import { query } from "../../../lib/db";

export const runtime = "nodejs";

async function save(request: NextRequest) {
  const account = await getAuthenticatedAccount(request);
  if (!account) return NextResponse.json({ ok: false, error: "Сначала войдите через Telegram" }, { status: 401 });
  const body = await request.json() as { name?: unknown; phone?: unknown; address?: unknown };
  const name = typeof body.name === "string" ? body.name.trim().slice(0,120) : "";
  const phone = typeof body.phone === "string" ? body.phone.replace(/[\s()-]/g, "").slice(0,30) : "";
  const address = typeof body.address === "string" ? body.address.trim().slice(0,500) : "";
  if (!name) return NextResponse.json({ ok:false,error:"Введите имя" }, {status:400});
  if (!/^\+66\d{9,10}$/.test(phone)) return NextResponse.json({ ok:false,error:"Проверьте номер телефона. Формат: +66XXXXXXXXX" }, {status:400});
  if (address.length < 4) return NextResponse.json({ ok:false,error:"Введите адрес" }, {status:400});
  await query(`UPDATE users SET profile_name=$2, full_name=$2, phone=$3, address=$4, updated_at=now() WHERE telegram_id=$1`, [account.telegramId,name,phone,address]);
  await query(`INSERT INTO customer_accounts (user_id,phone,password_hash) VALUES ($1,$2,'') ON CONFLICT (user_id) DO UPDATE SET phone=EXCLUDED.phone,updated_at=now()`, [account.userId,phone]);
  const data = await getShopAccountData(account.telegramId);
  return NextResponse.json({ok:true,...data});
}

export async function PUT(request: NextRequest) { return save(request); }
export async function POST(request: NextRequest) { return save(request); }
