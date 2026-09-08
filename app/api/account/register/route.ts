import { NextResponse } from "next/server";
export async function POST(){return NextResponse.json({ok:false,error:"Регистрация выполняется через Telegram."},{status:410});}
