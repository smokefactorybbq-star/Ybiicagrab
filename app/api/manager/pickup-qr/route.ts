import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { authorizeManager } from "../../../../lib/manager-auth";
import { buildPickupPointQrPayload } from "../../../../lib/qr";
import { findPickupPointByCode,listPickupPoints } from "../../../../lib/catalog";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff"};
const options={margin:4,width:800,errorCorrectionLevel:"M" as const};
function escapeHtml(s:string){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));}

export async function GET(request:Request){
  const auth=await authorizeManager(request);
  if(!auth.ok)return NextResponse.json({ok:false,error:auth.error},{status:auth.status,headers});
  const url=new URL(request.url), code=url.searchParams.get("point")||"", format=url.searchParams.get("format");
  try{
    if(!code){
      const pickupQrPoints=await listPickupPoints();
      if(format!=="catalog")return NextResponse.json({ok:true,points:pickupQrPoints},{headers});
      const points=await Promise.all(pickupQrPoints.map(async point=>({...point,image:await QRCode.toDataURL(buildPickupPointQrPayload(point.code),options)})));
      return NextResponse.json({ok:true,points},{headers});
    }
    const point=await findPickupPointByCode(code);
    if(!point)return NextResponse.json({ok:false,error:"Точка не найдена"},{status:404,headers});
    const payload=buildPickupPointQrPayload(code);
    if(format==="print"){
      const image=await QRCode.toDataURL(payload,options);
      return new NextResponse(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QR — ${escapeHtml(point.name)}</title><style>body{font:18px system-ui;text-align:center;margin:32px;color:#17382b}img{width:min(80vw,150mm);height:auto}button{padding:12px 24px;font:inherit;cursor:pointer}@media print{button{display:none}body{margin:15mm}}</style><h1>${escapeHtml(point.name)}</h1><p>${escapeHtml(point.address)}</p><img src="${image}" alt="QR точки"><p>Откройте личный кабинет MealPoint → Сканировать QR</p><p>Этот QR действует только на этой точке выдачи.</p><button onclick="window.print()">Распечатать</button></html>`,{headers:{...headers,"Content-Type":"text/html; charset=utf-8"}});
    }
    const attachment=url.searchParams.get("download")==="1"?"attachment":"inline";
    if(format==="png")return new NextResponse(new Uint8Array(await QRCode.toBuffer(payload,options)),{headers:{...headers,"Content-Type":"image/png","Content-Disposition":`${attachment}; filename="mealpoint-${code}.png"`}});
    return new NextResponse(await QRCode.toString(payload,{...options,type:"svg"}),{headers:{...headers,"Content-Type":"image/svg+xml; charset=utf-8","Content-Disposition":`${attachment}; filename="mealpoint-${code}.svg"`}});
  }catch(error){
    console.error("Pickup QR generation failed",error);
    return NextResponse.json({ok:false,error:"Не удалось создать QR. Укажите QR_SIGNING_SECRET длиной не менее 24 символов в Variables сервера и перезапустите сайт."},{status:503,headers});
  }
}
