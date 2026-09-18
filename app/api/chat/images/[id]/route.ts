import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAccount } from "../../../../../lib/auth";
import { authorizeManager } from "../../../../../lib/manager-auth";
import { query } from "../../../../../lib/db";
import { isUuid } from "../../../../../lib/validation";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  if(!isUuid(id))return new NextResponse(null,{status:404});
  const account=await getAuthenticatedAccount(request);
  const manager=await authorizeManager(request);
  if(!account&&!manager.ok)return new NextResponse(null,{status:401});
  const result=await query<{image_data:Buffer}>(`SELECT m.image_data FROM customer_messages m JOIN customer_conversations c ON c.id=m.conversation_id WHERE m.id=$1 AND m.image_data IS NOT NULL AND ($2::boolean OR c.user_id=$3::uuid)`,[id,manager.ok,account?.userId||null]);
  if(!result.rows[0])return new NextResponse(null,{status:404});
  return new NextResponse(new Uint8Array(result.rows[0].image_data),{headers:{"Content-Type":"image/webp","Content-Disposition":"inline; filename=chat-image.webp","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
