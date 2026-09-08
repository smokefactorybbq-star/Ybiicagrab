import { withTransaction } from "./db";
import { getAppClock } from "./app-time";

let running = false;

/**
 * DELIVERY: consumed automatically at 18:00 Phuket time unless paused.
 * PICKUP: consumed only after a successful customer QR scan.
 * Manager delivery confirmation is informational and does not itself decrement a day.
 */
export async function processSubscriptionDayClosures() {
  if (running) return { processed: 0 };
  running = true;
  try {
    const clock = await getAppClock();
    const canCloseToday = clock.hour > 18 || (clock.hour === 18 && clock.minute >= 0);
    const result = await withTransaction(async (client) => {
      const changed = await client.query<{ subscription_id: string }>(
        `UPDATE subscription_days sd
         SET status=CASE WHEN sd.delivery_received_at IS NOT NULL THEN 'REDEEMED'::subscription_day_status ELSE 'MISSED'::subscription_day_status END,
             consumed_at=COALESCE(consumed_at,now())
         FROM subscriptions s
         WHERE sd.subscription_id=s.id
           AND s.status='ACTIVE'
           AND COALESCE(sd.fulfillment_type,s.fulfillment_type)='DELIVERY'
           AND sd.status IN ('PLANNED','AVAILABLE')
           AND (
             sd.service_date < $1::date
             OR (sd.service_date = $1::date AND $2::boolean)
           )
         RETURNING sd.subscription_id::text`,
        [clock.date, canCloseToday]
      );
      const counts = new Map<string, number>();
      for (const row of changed.rows) counts.set(row.subscription_id, (counts.get(row.subscription_id) || 0) + 1);
      for (const [subscriptionId, count] of counts) {
        await client.query(
          `UPDATE subscriptions
           SET remaining_portions=GREATEST(0,remaining_portions-$2),
               status=CASE WHEN GREATEST(0,remaining_portions-$2)=0 THEN 'COMPLETED'::subscription_status ELSE status END,
               updated_at=now()
           WHERE id=$1`,
          [subscriptionId, count]
        );
      }
      return changed.rowCount || 0;
    });
    return { processed: result };
  } catch (error) {
    console.error("[subscription-maintenance] close failed", error);
    return { processed: 0 };
  } finally {
    running = false;
  }
}
