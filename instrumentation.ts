export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reconcileLimen } = await import("./lib/limenthai");
  const paymentScope = globalThis as typeof globalThis & Record<string, unknown>;
  if (!paymentScope.__limenthai_timer__) {
    paymentScope.__limenthai_timer__ = setInterval(() => void reconcileLimen(), 30000);
    void reconcileLimen();
  }
  const { processSubscriptionDayClosures } = await import("./lib/subscription-maintenance");
  void processSubscriptionDayClosures();
  const globalKey = "__mealpoint_subscription_timer__";
  const scope = globalThis as typeof globalThis & Record<string, unknown>;
  if (!scope[globalKey]) {
    scope[globalKey] = setInterval(() => void processSubscriptionDayClosures(), 5 * 60 * 1000);
  }
}
