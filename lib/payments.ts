import { existsSync } from "node:fs";
import { join } from "node:path";
export const paymentMethods = ["PROMPTPAY", "BANK_RU", "CASH"] as const;
export function paymentConfiguration() {
  const image = (name: string) => {
    for (const extension of ["png", "jpg", "jpeg", "webp"]) {
      if (existsSync(join(process.cwd(), "public", "payments", `${name}.${extension}`))) return `/payments/${name}.${extension}`;
    }
    return null;
  };
  const parsed = Number(process.env.THB_RUB_RATE || "2.75");
  return {thaiQr:image("thaibank"),russianQr:image("bankrf"),rubRate:Number.isFinite(parsed)&&parsed>0&&parsed<1000?parsed:null};
}
