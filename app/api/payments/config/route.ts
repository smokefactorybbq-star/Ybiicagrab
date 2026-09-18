import { NextResponse } from "next/server";
import { paymentConfiguration } from "../../../../lib/payments";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json({ok:true,...paymentConfiguration()},{headers:{"Cache-Control":"no-store"}}); }
