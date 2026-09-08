export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { processSubscriptionDayClosures } = await import("./lib/subscription-maintenance");
  void processSubscriptionDayClosures();
  const globalKey = "__mealpoint_subscription_timer__";
  const scope = globalThis as typeof globalThis & Record<string, unknown>;
  if (!scope[globalKey]) {
    scope[globalKey] = setInterval(() => void processSubscriptionDayClosures(), 5 * 60 * 1000);
  }
}
