import { notifyManagerTelegram } from "./telegram";

export type PickupBotEvent = {
  point: string;
  event: string;
  reason?: string | null;
  source?: string | null;
  last_seen?: string | null;
  temperature?: number | null;
  humidity?: number | null;
  rssi?: number | null;
  firmware?: string | null;
  message?: string | null;
};

function fallbackText(event: PickupBotEvent) {
  const point = event.point.toUpperCase();
  if (event.event === "temperature_high") {
    return `<b>🌡️🔴 MealPoint — ${point}</b>\nВысокая температура: ${event.temperature ?? "≥10"} °C`;
  }
  if (event.event === "temperature_normal") {
    return `<b>🌡️✅ MealPoint — ${point}</b>\nТемпература нормализовалась: ${event.temperature ?? "—"} °C`;
  }
  if (event.event === "device_boot") {
    return `<b>🔄✅ MealPoint — ${point}</b>\nESP32 успешно запустилась. Причина: ${event.reason || "—"}`;
  }
  return `<b>ℹ️ MealPoint — ${point}</b>\nСобытие: ${event.event}`;
}

export async function notifyPickupBot(event: PickupBotEvent) {
  const base = (process.env.MEALPOINT_BOT_URL || "").trim().replace(/\/$/, "");
  const secret = (process.env.MEALPOINT_BOT_SECRET || "").trim();

  if (!base || !secret) {
    if (event.event !== "heartbeat") {
      await notifyManagerTelegram({ text: fallbackText(event) });
    }
    return false;
  }

  try {
    const response = await fetch(`${base}/mealpoint/pickup/event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MealPoint-Secret": secret
      },
      body: JSON.stringify(event),
      cache: "no-store"
    });
    if (!response.ok) {
      console.error("[pickup-bot] HTTP", response.status, await response.text());
      if (event.event !== "heartbeat") {
        await notifyManagerTelegram({ text: fallbackText(event) });
      }
      return false;
    }
    return true;
  } catch (error) {
    console.error("[pickup-bot] request failed", error);
    if (event.event !== "heartbeat") {
      await notifyManagerTelegram({ text: fallbackText(event) });
    }
    return false;
  }
}
