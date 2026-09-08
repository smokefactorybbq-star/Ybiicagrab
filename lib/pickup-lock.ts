import { timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";

const DEFAULT_OPEN_SECONDS = 20;
const MIN_OPEN_SECONDS = 5;
const MAX_OPEN_SECONDS = 60;
const ONLINE_TTL_SECONDS = 15;

function envNameForPoint(pointCode: string) {
  return `PICKUP_LOCK_${pointCode.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_KEY`;
}

export function getPickupLockDeviceKey(pointCode: string) {
  return (process.env[envNameForPoint(pointCode)] || "").trim();
}

export function isPickupLockConfigured(pointCode: string) {
  return getPickupLockDeviceKey(pointCode).length >= 24;
}

export function verifyPickupLockDeviceKey(pointCode: string, suppliedKey: string) {
  const expected = getPickupLockDeviceKey(pointCode);
  if (expected.length < 24 || suppliedKey.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(suppliedKey, "utf8"), Buffer.from(expected, "utf8"));
}

export function getPickupLockOpenSeconds() {
  const parsed = Number.parseInt(process.env.PICKUP_LOCK_OPEN_SECONDS || "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_OPEN_SECONDS;
  return Math.min(MAX_OPEN_SECONDS, Math.max(MIN_OPEN_SECONDS, parsed));
}

export async function assertPickupLockOnline(client: PoolClient, pointCode: string) {
  if (!isPickupLockConfigured(pointCode)) return;

  const result = await client.query<{ online: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM pickup_lock_states
       WHERE point_code=$1
         AND last_seen_at >= now() - ($2::int * interval '1 second')
     ) AS online`,
    [pointCode, ONLINE_TTL_SECONDS]
  );

  if (!result.rows[0]?.online) throw new Error("LOCK_OFFLINE");
}

export async function requestPickupLockOpen(
  client: PoolClient,
  input: { pointCode: string; subscriptionId: string; subscriptionDayId: string }
) {
  if (!isPickupLockConfigured(input.pointCode)) return false;

  const seconds = getPickupLockOpenSeconds();
  await client.query(
    `INSERT INTO pickup_lock_states (
       point_code, open_until, last_redeemed_subscription_id, last_redeemed_subscription_day_id, updated_at
     ) VALUES (
       $1, now() + ($4::int * interval '1 second'), $2, $3, now()
     )
     ON CONFLICT (point_code) DO UPDATE SET
       open_until = GREATEST(COALESCE(pickup_lock_states.open_until, now()), EXCLUDED.open_until),
       last_redeemed_subscription_id = EXCLUDED.last_redeemed_subscription_id,
       last_redeemed_subscription_day_id = EXCLUDED.last_redeemed_subscription_day_id,
       updated_at = now()`,
    [input.pointCode, input.subscriptionId, input.subscriptionDayId, seconds]
  );
  return true;
}
