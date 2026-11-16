import { NextRequest,NextResponse } from "next/server";
import { getAuthenticatedAccount } from "../../../../lib/auth";
import { isSameOriginMutation } from "../../../../lib/request-security";
import { consumeRateLimit } from "../../../../lib/rate-limit";
import { syncLimen } from "../../../../lib/limenthai";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:NextRequest){
  if(!isSameOriginMutation(request))return NextResponse.json({ok:false},{status:403});
  try{
    const account=await getAuthenticatedAccount(request);
    if(!account)return NextResponse.json({ok:false},{status:401});
    const {subscriptionId}=await request.json();
    if(typeof subscriptionId!=="string"||! /^[0-9a-f-]{36}$/i.test(subscriptionId))return NextResponse.json({ok:false},{status:400});
    if(!(await consumeRateLimit(`limenthai:${account.userId}`,12,60)).allowed)return NextResponse.json({ok:false,error:"Слишком часто. Подождите минуту."},{status:429});
    return NextResponse.json({ok:true,payment:await syncLimen(subscriptionId,account.userId)},{headers:{"Cache-Control":"no-store"}});
  }catch{return NextResponse.json({ok:false,error:"Не удалось проверить платёж. Повторите позже или обратитесь к менеджеру. Не оплачивайте повторно."},{status:503,headers:{"Cache-Control":"no-store"}});}
}
