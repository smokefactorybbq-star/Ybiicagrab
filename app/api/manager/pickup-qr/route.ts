import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { authorizeManager } from "../../../../lib/manager-auth";
import { buildPickupPointQrPayload } from "../../../../lib/qr";
import { findPickupQrPointByCode, pickupQrPoints } from "../../../../data/pickupQrPoints";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth=await authorizeManager(request);
  if(!auth.ok) return NextResponse.json({ok:false,error:auth.error},{status:auth.status});
  const url=new URL(request.url); const pointCode=(url.searchParams.get('point')||'').trim();
  if(!pointCode) return NextResponse.json({ok:true,points:pickupQrPoints},{headers:{"Cache-Control":"no-store"}});
  const point = findPickupQrPointByCode(pointCode);
  if (!point) return new NextResponse('Not found', { status: 404 });
  try {
    const svg=await QRCode.toString(buildPickupPointQrPayload(point.code),{type:'svg',margin:2,width:640,errorCorrectionLevel:'M'});
    return new NextResponse(svg,{headers:{"Content-Type":"image/svg+xml; charset=utf-8","Cache-Control":"no-store","Content-Disposition":`inline; filename="mealpoint-${point.code}.svg"`}});
  } catch(error) {
    console.error('Pickup QR generation failed',error);
    return new NextResponse('PICKUP_QR_SECRET is not configured',{status:503});
  }
}
