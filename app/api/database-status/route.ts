import { NextResponse } from "next/server";
import { query } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await query<{ database_time: string }>("SELECT now()::text AS database_time");
    return NextResponse.json({ ok: true, databaseTime: result.rows[0].database_time });
  } catch (error) {
    console.error("Database status failed", error);
    return NextResponse.json({ ok: false, error: "Database is unavailable" }, { status: 503 });
  }
}
