import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAccount } from "../../../../lib/auth";
import { query } from "../../../../lib/db";
import { getAppClock } from "../../../../lib/app-time";
import { processSubscriptionDayClosures } from "../../../../lib/subscription-maintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toIsoDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0,10);
  return String(value||"").match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || "";
}

export async function GET(request: NextRequest) {
  try {
    await processSubscriptionDayClosures();
    const account = await getAuthenticatedAccount(request);
    if (!account) return NextResponse.json({ok:false,error:"Требуется вход"},{status:401});
    const subscriptionsResult = await query<any>(
      `SELECT s.id,s.code,s.status,s.selected_days,s.remaining_portions,s.pause_limit,s.pauses_used,s.rate_thb,s.total_thb,s.starts_on::text,s.ends_on::text,s.payment_method,s.rub_rate,s.fulfillment_type,s.pickup_point_code,s.pickup_point_name,s.customer_name,s.customer_phone,s.delivery_address,s.default_time,u.full_name,u.phone FROM subscriptions s JOIN users u ON u.id=s.user_id
       WHERE s.user_id=$1 ORDER BY s.created_at DESC LIMIT 300`, [account.userId]
    );
    const ids = subscriptionsResult.rows.map((x:any)=>x.id);
    const daysResult = ids.length ? await query<any>(
      `SELECT sd.subscription_id::text,sd.service_date::text,sd.status,sd.fulfillment_type,sd.requested_time,sd.customer_name,sd.customer_phone,sd.delivery_address,
              sd.redeemed_at,sd.consumed_at,sd.delivery_received_at,sd.pickup_redeemed_point_name,sd.price_thb,sd.discount_percent,
              COALESCE(pp.code,s.pickup_point_code) AS pickup_point_code,
              COALESCE(pp.name,s.pickup_point_name) AS pickup_point_name
       FROM subscription_days sd
       JOIN subscriptions s ON s.id=sd.subscription_id
       LEFT JOIN pickup_points pp ON pp.id=sd.pickup_point_id
       WHERE sd.subscription_id=ANY($1::uuid[]) ORDER BY sd.service_date ASC`, [ids]
    ) : {rows:[]};
    const daysBy = new Map<string,any[]>();
    for (const day of daysResult.rows) {
      const arr=daysBy.get(day.subscription_id)||[];
      arr.push({...day,service_date:toIsoDate(day.service_date)}); daysBy.set(day.subscription_id,arr);
    }
    const clock=await getAppClock();
    return NextResponse.json({ok:true,clock,subscriptions:subscriptionsResult.rows.map((s:any)=>({
      ...s,starts_on:toIsoDate(s.starts_on),ends_on:toIsoDate(s.ends_on),
      code:["ACTIVE","COMPLETED"].includes(s.status)?s.code:null,
      qrEnabled:s.fulfillment_type==="PICKUP",qrPausedToday:false,days:daysBy.get(s.id)||[]
    }))},{headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    console.error("List subscriptions failed",error);
    return NextResponse.json({ok:false,error:"Не удалось загрузить список подписок"},{status:500});
  }
}
