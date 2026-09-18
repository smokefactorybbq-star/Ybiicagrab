import { NextResponse } from "next/server";
import { authorizeManager } from "../../../../lib/manager-auth";
import { isSameOriginMutation } from "../../../../lib/request-security";
import { getDateDiscounts } from "../../../../lib/catalog";
import { withTransaction } from "../../../../lib/db";
import { validDate } from "../../../../lib/validation";
export const dynamic="force-dynamic";
export async function GET(r:Request){const a=await authorizeManager(r);if(!a.ok)return NextResponse.json(a,{status:a.status});return NextResponse.json({ok:true,discounts:await getDateDiscounts()},{headers:{"Cache-Control":"no-store"}});}
async function mutate(r:Request){
 if(!isSameOriginMutation(r))return NextResponse.json({ok:false,error:"Недопустимый источник запроса"},{status:403});
 const a=await authorizeManager(r);if(!a.ok)return NextResponse.json(a,{status:a.status});
 try{const b=await r.json();if(!Array.isArray(b.dates)||!b.dates.length||b.dates.length>366||b.dates.some((d:unknown)=>typeof d!=="string"||!validDate(d))||r.method!=="DELETE"&&![20,30,50].includes(b.percent))throw new Error("Выберите даты и скидку 20%, 30% или 50%");
 await withTransaction(async c=>{for(const date of [...new Set(b.dates)] as string[]){if(r.method==="DELETE")await c.query(`DELETE FROM meal_date_discounts WHERE service_date=$1::date`,[date]);else await c.query(`INSERT INTO meal_date_discounts(service_date,percent) VALUES($1::date,$2) ON CONFLICT(service_date) DO UPDATE SET percent=EXCLUDED.percent,updated_at=now()`,[date,b.percent]);}});
 return NextResponse.json({ok:true,discounts:await getDateDiscounts()});
 }catch(e){return NextResponse.json({ok:false,error:e instanceof Error&&!('code' in e)?e.message:"Не удалось изменить скидку"},{status:400});}
}
export const PUT=mutate;export const DELETE=mutate;
