const DEFAULT_COMPANY_QR =
  "00020101021130810016A00000067701011201150107536000315010214KB0000021596470320KPS004KB00000215964731690016A00000067701011301030040214KB0000021596470420KPS004KB00000215964753037645802TH63043C80";

type Tlv = { tag: string; value: string };

function parseTlv(payload: string): Tlv[] {
  const clean = String(payload || "").trim();
  const out: Tlv[] = [];
  let pos = 0;
  while (pos + 4 <= clean.length) {
    const tag = clean.slice(pos, pos + 2);
    const len = Number(clean.slice(pos + 2, pos + 4));
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(len) || len < 0) {
      throw new Error("INVALID_PROMPTPAY_TLV");
    }
    const start = pos + 4;
    const end = start + len;
    if (end > clean.length) throw new Error("INVALID_PROMPTPAY_LENGTH");
    out.push({ tag, value: clean.slice(start, end) });
    pos = end;
    if (tag === "63") break;
  }
  return out;
}

function encodeTlv(tag: string, value: string) {
  const length = Buffer.byteLength(value, "utf8");
  if (length > 99) throw new Error(`TLV_TOO_LONG_${tag}`);
  return `${tag}${String(length).padStart(2, "0")}${value}`;
}

function crc16CcittFalse(input: string) {
  const bytes = Buffer.from(input, "utf8");
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function companyPromptPayBasePayload() {
  return (process.env.PROMPTPAY_BASE_PAYLOAD || DEFAULT_COMPANY_QR).trim();
}

export function buildCompanyPromptPayPayload(amountValue: number) {
  const amount = Number(amountValue);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 9_999_999.99) {
    throw new Error("INVALID_AMOUNT");
  }

  const source = parseTlv(companyPromptPayBasePayload()).filter((part) => part.tag !== "63" && part.tag !== "54");
  let methodSeen = false;
  const parts: Tlv[] = [];

  for (const part of source) {
    if (part.tag === "01") {
      parts.push({ tag: "01", value: "12" }); // dynamic QR
      methodSeen = true;
      continue;
    }
    if (!methodSeen && Number(part.tag) > 1) {
      parts.push({ tag: "01", value: "12" });
      methodSeen = true;
    }
    if (Number(part.tag) > 54 && !parts.some((p) => p.tag === "54")) {
      parts.push({ tag: "54", value: amount.toFixed(2) });
    }
    parts.push(part);
  }

  if (!methodSeen) parts.splice(1, 0, { tag: "01", value: "12" });
  if (!parts.some((p) => p.tag === "54")) parts.push({ tag: "54", value: amount.toFixed(2) });

  // EMV tags must remain ascending at the root level. The merchant account tags are preserved verbatim.
  parts.sort((a, b) => Number(a.tag) - Number(b.tag));
  const withoutCrc = parts.map((part) => encodeTlv(part.tag, part.value)).join("") + "6304";
  return withoutCrc + crc16CcittFalse(withoutCrc);
}
