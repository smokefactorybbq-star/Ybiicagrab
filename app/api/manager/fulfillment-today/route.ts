import { NextResponse } from "next/server";
import { authorizeManager } from "../../../../lib/manager-auth";
import { getAppClock } from "../../../../lib/app-time";
import { addDaysToIso } from "../../../../lib/subscriptions";
import { query, withTransaction } from "../../../../lib/db";
import { isSameOriginMutation } from "../../../../lib/request-security";
import { processSubscriptionDayClosures } from "../../../../lib/subscription-maintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function operationalDate(date:string, hour:number) { return hour >= 22 ? addDaysToIso(date, 1) : date; }

export async function GET(request: Request) {
  const auth = await authorizeManager(request);
  if (!auth.ok) return NextResponse.json({ok:false,error:auth.error},{status:auth.status});
  await processSubscriptionDayClosures();
  const clock = await getAppClock();
  const serviceDate = operationalDate(clock.date, clock.hour);
  const result = await query<any>(
    `SELECT s.id::text AS subscription_id, s.code, s.fulfillment_type, s.pickup_point_name,
            u.full_name, COALESCE(sd.customer_phone,s.customer_phone,u.phone) AS phone,
            COALESCE(sd.delivery_address,s.delivery_address) AS delivery_address,
            COALESCE(sd.requested_time,s.default_time) AS requested_time,
            sd.status::text AS day_status, sd.redeemed_at, sd.pickup_redeemed_point_name,
            sd.delivery_received_at, sd.consumed_at
     FROM subscription_days sd
     JOIN subscriptions s ON s.id=sd.subscription_id
     JOIN users u ON u.id=s.user_id
     WHERE sd.service_date=$1::date
       AND s.status IN ('ACTIVE','COMPLETED')
       AND sd.status NOT IN ('PAUSED','PAUSE_REQUESTED')
     ORDER BY s.fulfillment_type DESC, COALESCE(sd.requested_time,s.default_time), u.full_name`,
    [serviceDate]
  );
  const pickupClients:any[]=[]; const deliveryClients:any[]=[];
  for (const r of result.rows) {
    const item={subscriptionId:r.subscription_id,code:r.code,fullName:r.full_name,phone:r.phone||null,pickupPointName:r.pickup_point_name||null,
      address:r.delivery_address||null,requestedTime:r.requested_time||null,dayStatus:r.day_status,
      pickedUp:Boolean(r.redeemed_at),pickedUpAt:r.redeemed_at||null,pickedUpPointName:r.pickup_redeemed_point_name||null,
      received:Boolean(r.delivery_received_at),receivedAt:r.delivery_received_at||null,consumed:Boolean(r.consumed_at)};
    if (r.fulfillment_type === 'DELIVERY') deliveryClients.push(item); else pickupClients.push(item);
  }
  return NextResponse.json({ok:true,serviceDate,resetHour:22,switchedToNextDay:clock.hour>=22,pickupClients,deliveryClients},{headers:{"Cache-Control":"no-store"}});
}

export async function PATCH(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ok:false,error:"Недопустимый источник запроса"},{status:403});
  const auth = await authorizeManager(request);
  if (!auth.ok) return NextResponse.json({ok:false,error:auth.error},{status:auth.status});
  const body=await request.json() as {subscriptionId?:unknown;serviceDate?:unknown;received?:unknown};
  const subscriptionId=typeof body.subscriptionId==='string'?body.subscriptionId.trim():'';
  const serviceDate=typeof body.serviceDate==='string'?body.serviceDate.trim():'';
  if (!subscriptionId || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate) || body.received!==true) return NextResponse.json({ok:false,error:"Некорректная команда"},{status:400});
  const clock=await getAppClock();
  if (serviceDate!==operationalDate(clock.date,clock.hour)) return NextResponse.json({ok:false,error:"Этот день уже закрыт"},{status:409});
  try {
    await withTransaction(async client=>{
      const cur=await client.query<{id:string;fulfillment_type:string;status:string;delivery_received_at:string|null}>(
        `SELECT sd.id::text, sd.fulfillment_type, sd.status::text, sd.delivery_received_at
         FROM subscription_days sd JOIN subscriptions s ON s.id=sd.subscription_id
         WHERE s.id=$1 AND sd.service_date=$2::date FOR UPDATE OF sd`,[subscriptionId,serviceDate]);
      const day=cur.rows[0];
      if(!day||day.fulfillment_type!=='DELIVERY'||['PAUSED','PAUSE_REQUESTED'].includes(day.status)) throw new Error('NOT_FOUND');
      if(day.delivery_received_at) return;
      await client.query(`UPDATE subscription_days SET delivery_received_at=now(), delivery_received_by=$2 WHERE id=$1`,[day.id,auth.username]);
      await client.query(`INSERT INTO manager_events(event_type,entity_id,payload) VALUES('DELIVERY_RECEIVED',$1,$2::jsonb)`,[subscriptionId,JSON.stringify({serviceDate,confirmedBy:auth.username})]);
    });
    return NextResponse.json({ok:true});
  } catch { return NextResponse.json({ok:false,error:"Не удалось отметить получение"},{status:400}); }
}
