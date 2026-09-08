import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { getAuthenticatedAccount } from "../../../../lib/auth";
import { buildCompanyPromptPayPayload } from "../../../../lib/promptpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const account = await getAuthenticatedAccount(request);
  if (!account) return NextResponse.json({ ok: false, error: "Требуется вход" }, { status: 401 });
  try {
    const body = await request.json();
    const amount = Number(body?.amount);
    const payload = buildCompanyPromptPayPayload(amount);
    const dataUrl = await QRCode.toDataURL(payload, { width: 720, margin: 2, errorCorrectionLevel: "M" });
    return NextResponse.json({ ok: true, amount: Number(amount.toFixed(2)), payload, dataUrl });
  } catch (error) {
    console.error("MealPoint PromptPay QR failed", error);
    return NextResponse.json({ ok: false, error: "Не удалось создать QR" }, { status: 400 });
  }
}
