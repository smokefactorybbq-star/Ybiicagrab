import { query } from "./db";

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const BANGKOK_ZONE = "Asia/Bangkok";

type RuntimeRow = {
  test_mode: boolean;
  test_datetime_local: string | null;
};

export type AppClock = {
  isTestMode: boolean;
  date: string;
  hour: number;
  minute: number;
  localDateTime: string;
  iso: string;
};

function realBangkokClock(now = new Date()): AppClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BANGKOK_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "00";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const localDateTime = `${date}T${get("hour")}:${get("minute")}`;
  return {
    isTestMode: false,
    date,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    localDateTime,
    iso: now.toISOString()
  };
}

export async function getAppClock(): Promise<AppClock> {
  try {
    const result = await query<RuntimeRow>(
      `SELECT test_mode, test_datetime_local FROM app_runtime_settings WHERE id = 1 LIMIT 1`
    );
    const row = result.rows[0];
    if (row?.test_mode && row.test_datetime_local && LOCAL_DATE_TIME.test(row.test_datetime_local)) {
      const localDateTime = row.test_datetime_local;
      const [date, time] = localDateTime.split("T");
      const [hour, minute] = time.split(":").map(Number);
      return {
        isTestMode: true,
        date,
        hour,
        minute,
        localDateTime,
        iso: new Date(`${localDateTime}:00+07:00`).toISOString()
      };
    }
  } catch (error) {
    console.warn("Test clock unavailable, using real time", error);
  }
  return realBangkokClock();
}

export function isValidTestDateTime(value: string) {
  return LOCAL_DATE_TIME.test(value) && !Number.isNaN(new Date(`${value}:00+07:00`).getTime());
}
