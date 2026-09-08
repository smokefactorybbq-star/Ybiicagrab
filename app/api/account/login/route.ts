import { NextResponse } from "next/server";
export async function POST(){return NextResponse.json({ok:false,error:"Вход по паролю отключён. Используйте вход через Telegram."},{status:410});}
