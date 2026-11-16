import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAccount } from "../../../../lib/auth";
import { isSameOriginMutation } from "../../../../lib/request-security";
import { consumeRateLimit } from "../../../../lib/rate-limit";
import { syncLimen, quoteLimen, limenErrorCode, limenErrorMessage } from "../../../../lib/limenthai";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {"Cache-Control":"no-store","X-LimenThai-Integration":"2026-11-16-sandbox-v2"};
export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ok:false,error:"Обновите страницу сайта и повторите запрос."},{status:403,headers});
  let id: string | undefined;
  let action: string | undefined;
  try {
    const account = await getAuthenticatedAccount(request);
    if (!account) return NextResponse.json({ok:false,error:"Войдите в личный кабинет заново."},{status:401,headers});
    const body = await request.json();
    id = body.subscriptionId;
    action = body.action ?? "status";
    if (typeof id !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) || !["quote","pay","status"].includes(action!)) return NextResponse.json({ok:false,error:"Некорректный запрос."},{status:400,headers});
    if (action === "pay" && (typeof body.acceptedRub !== "string" || !/^\d{1,12}\.\d{2}$/.test(body.acceptedRub))) return NextResponse.json({ok:false,error:"Сначала обновите сумму оплаты."},{status:400,headers});
    if (!(await consumeRateLimit(`limenthai:${account.userId}`,12,60)).allowed) return NextResponse.json({ok:false,error:"Слишком часто. Подождите минуту."},{status:429,headers});
    const payment = action === "quote" ? await quoteLimen(id,account.userId) : await syncLimen(id,account.userId,action === "pay" ? body.acceptedRub : undefined);
    return NextResponse.json({ok:true,payment},{headers});
  } catch (error) {
    const code = limenErrorCode(error);
    console.error("LimenThai request failed",{subscriptionId:id,action,code});
    return NextResponse.json({ok:false,error:limenErrorMessage(code),code},{status:code === "NOT_FOUND" ? 404 : code === "PRICE_CHANGED" ? 409 : 503,headers});
  }
}
