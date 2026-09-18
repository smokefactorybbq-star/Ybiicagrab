import { NextResponse } from "next/server";
import { authorizeManager } from "../../../../../lib/manager-auth";
import { isSameOriginMutation } from "../../../../../lib/request-security";
import { withTransaction } from "../../../../../lib/db";
import { isUuid } from "../../../../../lib/validation";
import { addDaysToIso,getPauseLimit } from "../../../../../lib/subscriptions";
export async function POST(r:Request){
 if(!isSameOriginMutation(r))return NextResponse.json({ok:false,error:"Недопустимый источник запроса"},{status:403});
 const a=await authorizeManager(r);if(!a.ok)return NextResponse.json(a,{status:a.status});
 try{const b=await r.json();if(!isUuid(b.id)||!isUuid(b.requestKey)||!Number.isInteger(b.days)||b.days<1||b.days>365)throw new Error("Укажите целое количество дней от 1 до 365");
 const result=await withTransaction(async c=>{
  const s=(await c.query(`SELECT * FROM subscriptions WHERE id=$1 FOR UPDATE`,[b.id])).rows[0];if(!s)throw new Error("Подписка не найдена");
  const previous=(await c.query(`SELECT subscription_id,days,first_date::text,last_date::text FROM subscription_day_extensions WHERE request_key=$1`,[b.requestKey])).rows[0];
  if(previous){if(previous.subscription_id!==b.id||previous.days!==b.days)throw new Error("Повторный запрос отличается от исходного");return previous;}
  if(!['ACTIVE','COMPLETED','AWAITING_ACTIVATION'].includes(s.status))throw new Error("К этой подписке нельзя добавить дни");
  const last=(await c.query(`SELECT MAX(service_date)::text AS date FROM subscription_days WHERE subscription_id=$1`,[b.id])).rows[0].date;
  if(!last)throw new Error("В подписке нет исходных дат");
  const first=addDaysToIso(last,1),end=addDaysToIso(last,b.days);
  for(let n=1;n<=b.days;n++)await c.query(`INSERT INTO subscription_days(subscription_id,service_date,status,fulfillment_type,requested_time,customer_name,customer_phone,delivery_address,price_thb) VALUES($1,$2::date,$3,$4,$5,$6,$7,$8,0)`,[b.id,addDaysToIso(last,n),s.status==='AWAITING_ACTIVATION'?'PLANNED':'AVAILABLE',s.fulfillment_type,s.fulfillment_type==='DELIVERY'?s.default_time:null,s.customer_name,s.customer_phone,s.delivery_address]);
  await c.query(`UPDATE subscriptions SET selected_days=selected_days+$2,remaining_portions=remaining_portions+$2,ends_on=$3::date,pause_limit=$4,status=CASE WHEN status='COMPLETED' THEN 'ACTIVE'::subscription_status ELSE status END,updated_at=now() WHERE id=$1`,[b.id,b.days,end,getPauseLimit(s.selected_days+b.days)]);
  await c.query(`INSERT INTO subscription_day_extensions(request_key,subscription_id,days,first_date,last_date) VALUES($1,$2,$3,$4,$5)`,[b.requestKey,b.id,b.days,first,end]);
  await c.query(`INSERT INTO manager_events(event_type,entity_id,payload) VALUES('SUBSCRIPTION_DAYS_ADDED',$1,$2::jsonb)`,[b.id,JSON.stringify({days:b.days,firstDate:first,lastDate:end,requestKey:b.requestKey,additionalCharge:0})]);
  return {days:b.days,first_date:first,last_date:end};
 });return NextResponse.json({ok:true,extension:result});
 }catch(e){return NextResponse.json({ok:false,error:e instanceof Error&&!('code' in e)?e.message:"Не удалось добавить дни"},{status:400});}
}
