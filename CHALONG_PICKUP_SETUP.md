# MealPoint Chalong — deployment notes

## Site (MealPoint) Railway Variables

Keep all existing variables unchanged. Add/check:

- `PICKUP_LOCK_CHALONG_KEY` — exactly the same value as `DEVICE_KEY` in the ESP32 firmware. Minimum 24 characters.
- `PICKUP_LOCK_OPEN_SECONDS=20`
- `MEALPOINT_BOT_URL` — public base URL of the Telegram bot Railway service, without a trailing slash.
  Example: `https://your-bot-production.up.railway.app`
- `MEALPOINT_BOT_SECRET` — the same secret value configured in the Telegram bot service.

The database migration runs automatically from `scripts/start.mjs` through `scripts/db-init.mjs`.

## Telegram bot Railway Variables

Keep all existing variables unchanged. Add/check:

- `MEALPOINT_BOT_SECRET` — same value as on the MealPoint site.
- `MEALPOINT_SITE_URL=https://www.meal-point.com`
- `PICKUP_MONITOR_POINT=chalong` (optional; default is `chalong`)
- `PICKUP_OFFLINE_AFTER_SECONDS=420` (optional; default is 7 minutes)

The bot checks the MealPoint server once per minute. The ESP32 itself continues to poll
`/api/pickup-lock?point=chalong` every 2 seconds, so the server has an accurate `last_seen_at`.

## ESP32 after the site is deployed

The current lock/opening logic works without the extended API.

To enable reboot/temperature events, change:

```cpp
const bool ENABLE_EXTENDED_API = false;
```

to:

```cpp
const bool ENABLE_EXTENDED_API = true;
```

and flash the ESP32 again.

Until the DHT11 is physically connected, keep:

```cpp
const bool ENABLE_DHT = false;
```

After the sensor is connected, switch it to `true`.

## New site endpoints

- `GET /api/pickup-lock?point=chalong` — existing ESP32 lock polling, unchanged.
- `POST /api/pickup-lock/telemetry` — temperature/humidity from ESP32.
- `POST /api/pickup-lock/event` — ESP32 boot/temperature/status events.
- `GET /api/pickup-lock/monitor?point=chalong` — bot-only health check protected by `X-MealPoint-Secret`.
- `GET /api/manager/pickup-lock?point=chalong` — manager dashboard status.
- `POST /api/manager/pickup-lock` — manager "Open door" command.

## Behaviour preserved

Customer QR redemption still:
1. validates the authenticated customer and the selected pickup point;
2. refuses to consume a day while the lock controller is offline;
3. consumes one subscription day once;
4. writes `open_until` for the configured lock period;
5. the ESP32 sees `open=true` on its existing polling endpoint.

The manager button uses the same `open_until` mechanism but does not consume a customer's subscription day.
