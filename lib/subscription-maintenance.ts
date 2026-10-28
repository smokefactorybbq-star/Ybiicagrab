import { withTransaction } from "./db";
import { getAppClock } from "./app-time";

let running = false;

/**
 * DELIVERY: remains open through the service date because a customer may agree
 * a time after 18:00 with the manager. It is consumed when the date becomes past.
 * PICKUP: consumed immediately after a successful QR scan, or automatically
 * at 21:00 if the meal was not collected.
 */
export async function processSubscriptionDayClosures() {
  if (running) return { processed: 0 };
  running = true;
  try {
    const clock = await getAppClock();
    const canClosePickupToday = clock.hour >= 21;
    const result = await withTransaction(async (client) => {
      const changed = await client.query<{ subscription_id: string }>(
        `UPDATE subscription_days sd
         SET status=CASE
               WHEN COALESCE(sd.fulfillment_type,s.fulfillment_type)='DELIVERY' AND sd.delivery_received_at IS NOT NULL
                 THEN 'REDEEMED'::subscription_day_status
               ELSE 'MISSED'::subscription_day_status
             END,
             consumed_at=COALESCE(consumed_at,now())
         FROM subscriptions s
         WHERE sd.subscription_id=s.id
           AND s.status='ACTIVE'
           AND sd.status IN ('PLANNED','AVAILABLE')
           AND (
             sd.service_date < $1::date
             OR (
               sd.service_date = $1::date
               AND COALESCE(sd.fulfillment_type,s.fulfillment_type)='PICKUP'
               AND $2::boolean
             )
           )
         RETURNING sd.subscription_id::text`,
        [clock.date, canClosePickupToday]
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
