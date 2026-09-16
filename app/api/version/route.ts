import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      app: "MealPoint",
      version: "0.9.3",
      telegramConfigRoute: "/api/auth/telegram/config"
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
