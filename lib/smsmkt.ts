export function normalizeInternationalPhone(input: unknown) {
  let phone = String(input || "").trim().replace(/[\s().-]/g, "");
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  if (!phone.startsWith("+")) phone = `+${phone.replace(/^\+/, "")}`;
  phone = `+${phone.slice(1).replace(/\D/g, "")}`;
  return phone;
}

function credentials() {
  const apiKey = String(process.env.SMSMKT_API_KEY || "").trim();
  const secretKey = String(process.env.SMSMKT_SECRET_KEY || "").trim();
  const projectKey = String(process.env.SMSMKT_PROJECT_KEY || "").trim();
  if (!apiKey || !secretKey || !projectKey) throw new Error("SMSMKT_NOT_CONFIGURED");
  return { apiKey, secretKey, projectKey };
}

async function postForm(url: string, values: Record<string, string>) {
  const { apiKey, secretKey } = credentials();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "api_key": apiKey,
      "secret_key": secretKey,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body: new URLSearchParams(values).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json().catch(() => null) as any;
  if (!response.ok || !data) throw new Error(`SMSMKT_HTTP_${response.status}`);
  return data;
}

export async function sendSmsMktOtp(phone: string, refCode: string) {
  const { projectKey } = credentials();
  const url = String(process.env.SMSMKT_OTP_SEND_URL || "https://api-inter.smsmkt.com/api/inter/send/otp").trim();
  const data = await postForm(url, { project_key: projectKey, phone, ref_code: refCode });
  const token = String(data?.result?.token || "").trim();
  const responseRef = String(data?.result?.ref_code ?? refCode).trim();
  if (!token) throw new Error(`SMSMKT_SEND_FAILED:${String(data?.detail || data?.code || "unknown")}`);
  return { token, refCode: responseRef, rawCode: String(data?.code || "") };
}

export async function validateSmsMktOtp(token: string, otpCode: string, refCode: string) {
  const url = String(process.env.SMSMKT_OTP_VALIDATE_URL || "https://portal-otp.smsmkt.com/api/otp-validate").trim();
  const values: Record<string, string> = { token, otp_code: otpCode };
  if (refCode) values.ref_code = refCode;
  const data = await postForm(url, values);
  const ok = data?.result?.status === true || data?.result?.status === 1 || String(data?.result?.status).toLowerCase() === "true";
  if (!ok) throw new Error(`SMSMKT_OTP_INVALID:${String(data?.detail || data?.code || "invalid")}`);
  return true;
}
