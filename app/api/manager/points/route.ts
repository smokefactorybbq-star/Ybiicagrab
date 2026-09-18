import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { authorizeManager } from "../../../../lib/manager-auth";
import { isSameOriginMutation } from "../../../../lib/request-security";
import { withTransaction } from "../../../../lib/db";
import { listPickupPoints } from "../../../../lib/catalog";
import { googleMapUrl,resolveGoogleCoordinates,validCoordinates } from "../../../../lib/google-map-link";
export const dynamic="force-dynamic";
export async function GET(request:Request){const a=await authorizeManager(request);if(!a.ok)return NextResponse.json(a,{status:a.status});return NextResponse.json({ok:true,points:await listPickupPoints()},{headers:{"Cache-Control":"no-store"}});}
async function mutate(request:Request){
 if(!isSameOriginMutation(request))return NextResponse.json({ok:false,error:"Недопустимый источник запроса"},{status:403});
 const a=await authorizeManager(request);if(!a.ok)return NextResponse.json(a,{status:a.status});
 try{
 const b=await request.json();const code=typeof b.code==="string"?b.code:"";
 if(request.method!=="POST"&&!/^[a-z0-9-]{2,40}$/.test(code))throw new Error("Не указана точка");
 let district="",number="",url="",lat=0,lng=0;
 if(request.method!=="DELETE"){
  district=typeof b.district==="string"?b.district.trim():"";number=typeof b.pointNumber==="string"?b.pointNumber.trim():"";url=typeof b.googleMapsUrl==="string"?b.googleMapsUrl.trim():"";
  if(district.length<2||district.length>80||!/^\d{1,6}$/.test(number)||Number(number)<1||url.length>4096||!googleMapUrl(url))throw new Error("Укажите район, номер точки и HTTPS-ссылку Google Maps");
  const coords=validCoordinates(b.latitude,b.longitude)?{latitude:b.latitude,longitude:b.longitude}:await resolveGoogleCoordinates(url);
  if(!coords)throw new Error("Не удалось определить место из ссылки. Отметьте точку на карте в форме.");
  lat=coords.latitude;lng=coords.longitude;
 }
 const result=await withTransaction(async c=>{
  let old:any=null;
  if(request.method!=="POST"){old=(await c.query(`SELECT * FROM pickup_points WHERE code=$1 FOR UPDATE`,[code])).rows[0];if(!old)throw new Error("Точка не найдена");}
  if(request.method==="DELETE"){
   await c.query(`UPDATE subscriptions SET pickup_point_name=NULL,pickup_point_code=NULL,updated_at=now() WHERE pickup_point_code=$1`,[code]);
   await c.query(`UPDATE subscription_days SET pickup_point_id=NULL,pickup_redeemed_point_name=NULL WHERE pickup_point_id=$1 OR pickup_redeemed_point_name=$2`,[old.id,old.name]);
   await c.query(`UPDATE subscription_scans SET pickup_point_id=NULL,pickup_point_name=NULL WHERE pickup_point_id=$1 OR pickup_point_name=$2`,[old.id,old.name]);
   await c.query(`DELETE FROM pickup_point_daily_inventory WHERE pickup_point_name=$1`,[old.name]);
   await c.query(`DELETE FROM pickup_lock_states WHERE point_code=$1`,[code]);
   await c.query(`DELETE FROM pickup_points WHERE code=$1`,[code]);return {code};
  }
  const nextCode=old?code:`pv-${randomBytes(8).toString("hex")}`,name=`${district} · ПВ №${number}`;
  if(old){
   await c.query(`UPDATE pickup_points SET name=$2,district=$3,point_number=$4,address=$3,google_maps_url=$5,latitude=$6,longitude=$7,updated_at=now() WHERE code=$1`,[code,name,district,number,url,lat,lng]);
   await c.query(`UPDATE subscriptions SET pickup_point_name=$2,updated_at=now() WHERE pickup_point_code=$1`,[code,name]);
   // Historical receipt locations remain accurate; current stock follows the renamed point.
   await c.query(`UPDATE pickup_point_daily_inventory SET pickup_point_name=$2 WHERE pickup_point_name=$1`,[old.name,name]);
  }else await c.query(`INSERT INTO pickup_points(code,name,district,point_number,address,google_maps_url,latitude,longitude) VALUES($1,$2,$3,$4,$3,$5,$6,$7)`,[nextCode,name,district,number,url,lat,lng]);
  return {code:nextCode,name};
 });
 return NextResponse.json({ok:true,point:result},{status:request.method==="POST"?201:200});
 }catch(e){console.error("Point update failed",e);const conflict=(e as {code?:string}).code==="23505";return NextResponse.json({ok:false,error:conflict?"В этом районе уже есть точка с таким номером":e instanceof Error&&!('code' in e)?e.message:"Не удалось сохранить точку"},{status:conflict?409:400});}
}
export const POST=mutate;export const PATCH=mutate;export const DELETE=mutate;
