import { query } from "./db";

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number;
};

export function clientIp(request: Request) {
  // Railway explicitly supplies X-Real-IP as the remote client address.
  // Prefer that platform-controlled header over user-provided forwarding chains.
  const real = (request.headers.get("x-real-ip") || "").trim();
  if (real) return real.slice(0, 120);

  const forwarded = (request.headers.get("x-forwarded-for") || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (forwarded[0]) return forwarded[0].slice(0, 120);

  const cf = (request.headers.get("cf-connecting-ip") || "").trim();
  if (cf) return cf.slice(0, 120);
  return "unknown";
}

export async function consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const safeKey = key.slice(0, 300);
  const bucketEpoch = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
  const result = await query<{ count: number }>(
    `INSERT INTO security_rate_limits (rate_key, window_start, hits)
     VALUES ($1, to_timestamp($2), 1)
     ON CONFLICT (rate_key, window_start)
     DO UPDATE SET hits = security_rate_limits.hits + 1
     RETURNING hits::int AS count`,
    [safeKey, bucketEpoch]
  );
  const count = Number(result.rows[0]?.count || 1);
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    allowed: count <= limit,
    count,
    limit,
    retryAfterSeconds: Math.max(1, bucketEpoch + windowSeconds - nowSeconds)
  };
}

export async function pruneRateLimits() {
  await query(`DELETE FROM security_rate_limits WHERE window_start < now() - interval '2 days'`);
}
