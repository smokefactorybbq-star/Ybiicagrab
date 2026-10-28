import { NextResponse } from "next/server";
export async function POST() { return NextResponse.json({ok:false,error:"Вход по SMS отключён. Используйте Telegram."},{status:410}); }
