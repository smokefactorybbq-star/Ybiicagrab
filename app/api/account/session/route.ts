import { NextResponse } from "next/server";

export const runtime = "nodejs";

function gone() {
  return NextResponse.json({ ok: false, error: "Legacy auth endpoint disabled" }, { status: 410 });
}

export const GET = gone;
export const POST = gone;
export const DELETE = gone;
