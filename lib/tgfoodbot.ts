type BotJson = Record<string, unknown>;

async function postToBot(path: string, payload: BotJson) {
  const base = String(process.env.TGFOODBOT_URL || "").trim().replace(/\/+$/, "");
  const secret = String(process.env.MEALPOINT_BOT_SECRET || "").trim();
  if (!base || secret.length < 24) throw new Error("TGFOODBOT_NOT_CONFIGURED");
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-MealPoint-Secret": secret },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`TGFOODBOT_HTTP_${response.status}`);
  return response.json().catch(() => ({ ok: true }));
}

export async function notifyBotSubscription(payload: BotJson) {
  return postToBot("/mealpoint/subscription", payload);
}

export async function notifyBotReceipt(payload: BotJson) {
  return postToBot("/mealpoint/receipt", payload);
}
