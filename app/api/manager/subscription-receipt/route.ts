import { NextRequest, NextResponse } from "next/server";
import { authorizeManager } from "../../../../lib/manager-auth";
import { query } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = authorizeManager(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const id = request.nextUrl.searchParams.get("subscriptionId") || "";
  const result = await query<{ file_name: string; mime_type: string; file_data: Buffer }>(
    `SELECT file_name,mime_type,file_data FROM subscription_receipts WHERE subscription_id=$1 LIMIT 1`, [id]
  );
  const row = result.rows[0];
  if (!row) return NextResponse.json({ ok: false, error: "Чек не найден" }, { status: 404 });
  return new NextResponse(new Uint8Array(row.file_data), {
    headers: {
      "Content-Type": row.mime_type,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
