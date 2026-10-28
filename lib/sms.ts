import { createHash, randomInt } from "node:crypto";

export function createOtpCode() {
  return String(randomInt(100000, 1000000));
}

export function hashOtp(phone: string, code: string) {
  const secret = process.env.SMS_OTP_SECRET || "mealpoint-local-development";
  return createHash("sha256").update(`${phone}:${code}:${secret}`).digest("hex");
}

export async function sendOtpSms(phone: string, code: string): Promise<{ sent: boolean; provider: "custom" | "twilio" | "dev"; debugCode?: string }> {
  const message = `MealPoint: код входа ${code}. Код действует 5 минут.`;
  const customUrl = (process.env.SMS_HTTP_URL || "").trim();
  const customToken = (process.env.SMS_HTTP_TOKEN || "").trim();
  if (customUrl) {
    const response = await fetch(customUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(customToken ? { Authorization: `Bearer ${customToken}` } : {})
      },
      body: JSON.stringify({ phone, message, code })
    });
    if (!response.ok) throw new Error(`SMS provider returned ${response.status}`);
    return { sent: true, provider: "custom" as const };
  }

  const sid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = (process.env.TWILIO_FROM || "").trim();
  if (sid && token && from) {
    const body = new URLSearchParams({ To: phone, From: from, Body: message });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });
    if (!response.ok) throw new Error(`Twilio returned ${response.status}: ${await response.text()}`);
    return { sent: true, provider: "twilio" as const };
  }

  const devMode = process.env.SMS_DEV_MODE === "true" || process.env.NODE_ENV !== "production";
  if (devMode) {
    console.log(`[sms:dev] ${phone}: ${message}`);
    return { sent: false, provider: "dev" as const, debugCode: code };
  }

  throw new Error("SMS provider is not configured");
}
