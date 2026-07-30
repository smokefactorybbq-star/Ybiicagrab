import { createHash, randomBytes } from "node:crypto";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const BANGKOK_TIME_ZONE = "Asia/Bangkok";

export function normalizePhone(phone: string) {
  return phone.trim().replace(/[^\d+]/g, "");
}

export function normalizeDates(input: unknown) {
  if (!Array.isArray(input)) return [];

  return [...new Set(
    input
      .filter((value): value is string => typeof value === "string" && ISO_DATE.test(value))
      .sort()
  )];
}

export function getBangkokTodayIso() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BANGKOK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export function addDaysToIso(isoDate: string, amount: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

export function getTomorrowBangkokIso() {
  return addDaysToIso(getBangkokTodayIso(), 1);
}

export function validateConsecutiveDates(dates: string[], todayIso = getBangkokTodayIso()) {
  if (!dates.length) return { valid: false, error: "Выберите хотя бы один день" };
  if (dates.length > 30) return { valid: false, error: "Можно выбрать не более 30 дней" };

  const tomorrow = addDaysToIso(todayIso, 1);
  if (dates[0] < tomorrow) {
    return { valid: false, error: "Подписка должна начинаться не раньше завтрашнего дня" };
  }

  for (let index = 1; index < dates.length; index += 1) {
    if (dates[index] !== addDaysToIso(dates[index - 1], 1)) {
      return { valid: false, error: "Дни подписки должны идти подряд" };
    }
  }

  return { valid: true, error: "" };
}

export function calculateSubscriptionPrice(dates: string[]) {
  if (!dates.length) return { rate: 0, total: 0 };
  const rate = dates.length >= 30 ? 250 : dates.length >= 7 ? 300 : 350;
  return { rate, total: dates.length * rate };
}

export function getPauseLimit(selectedDays: number) {
  if (selectedDays >= 30) return 3;
  if (selectedDays >= 14) return 2;
  if (selectedDays >= 7) return 1;
  return 0;
}

export function createSubscriptionCode() {
  const year = new Date().getUTCFullYear();
  const randomPart = randomBytes(4).toString("hex").toUpperCase();
  return `MP-${year}-${randomPart}`;
}

export function createPendingCode() {
  return `PENDING-${randomBytes(8).toString("hex").toUpperCase()}`;
}

export function createAccessToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
