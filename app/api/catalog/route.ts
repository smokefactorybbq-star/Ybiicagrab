import { NextResponse } from "next/server";
import { listPickupPoints,getDateDiscounts } from "../../../lib/catalog";
export const dynamic="force-dynamic";
export async function GET(){try{const [points,discounts]=await Promise.all([listPickupPoints(),getDateDiscounts()]);return NextResponse.json({ok:true,points,discounts,basePrice:350},{headers:{"Cache-Control":"no-store"}});}catch(e){console.error("Catalogue failed",e);return NextResponse.json({ok:false,error:"Не удалось загрузить точки и цены. Попробуйте обновить страницу."},{status:503});}}
