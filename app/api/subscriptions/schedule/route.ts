import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAccount } from "../../../../lib/auth";
import { getAppClock } from "../../../../lib/app-time";
import { query } from "../../../../lib/db";
import { processSubscriptionDayClosures } from "../../../../lib/subscription-maintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validTime(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [h,m] = value.split(":").map(Number);
  const minutes = h*60+m;
  return minutes >= 12*60 && minutes <= 18*60;
}

export async function PATCH(request: NextRequest) {
  await processSubscriptionDayClosures();
  const account = await getAuthenticatedAccount(request);
  if (!account) return NextResponse.json({ok:false,error:"Требуется вход"},{status:401});
  const body = await request.json() as { subscriptionId?:unknown; serviceDate?:unknown; requestedTime?:unknown };
  const subscriptionId = typeof body.subscriptionId === "string" ? body.subscriptionId.trim() : "";
  const serviceDate = typeof body.serviceDate === "string" ? body.serviceDate.trim() : "";
  const requestedTime = typeof body.requestedTime === "string" ? body.requestedTime.trim() : "";
  if (!subscriptionId || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate) || !validTime(requestedTime)) {
    return NextResponse.json({ok:false,error:"Выберите время с 12:00 до 18:00"},{status:400});
  }
  const clock = await getAppClock();
  if (serviceDate < clock.date) return NextResponse.json({ok:false,error:"Нельзя изменить время прошедшего дня"},{status:400});
  if (serviceDate === clock.date && (clock.hour > 11 || (clock.hour === 11 && clock.minute >= 30))) {
    return NextResponse.json({ok:false,error:"После 11:30 время на сегодня изменить нельзя. Можно изменить следующий день."},{status:409});
  }
  const result = await query<{id:string}>(
    `UPDATE subscription_days sd
     SET requested_time=$4
     FROM subscriptions s
     WHERE sd.subscription_id=s.id AND s.id=$1 AND s.user_id=$2 AND sd.service_date=$3::date
       AND sd.status IN ('PLANNED','AVAILABLE')
     RETURNING sd.id::text`,
    [subscriptionId,account.userId,serviceDate,requestedTime]
  );
  if (!result.rowCount) return NextResponse.json({ok:false,error:"Этот день недоступен для изменения"},{status:404});
  return NextResponse.json({ok:true,requestedTime});
}
