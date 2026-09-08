-- MealPoint subscription-only schema for Railway PostgreSQL.
-- Safe to run on every deploy. It creates/extends only the tables required
-- for subscriptions, customer accounts, pickup QR, staff dashboards and locks.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('CUSTOMER', 'MANAGER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('PENDING_PAYMENT', 'AWAITING_ACTIVATION', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'AWAITING_ACTIVATION';

DO $$ BEGIN
  CREATE TYPE subscription_day_status AS ENUM ('PLANNED', 'PAUSE_REQUESTED', 'PAUSED', 'AVAILABLE', 'REDEEMED', 'MISSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT,
  username TEXT,
  telegram_username TEXT,
  telegram_first_name TEXT,
  telegram_last_name TEXT,
  profile_name TEXT,
  full_name TEXT,
  phone TEXT,
  address TEXT,
  photo_url TEXT,
  avatar_url TEXT,
  role user_role DEFAULT 'CUSTOMER',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_site_visit_at TIMESTAMPTZ
);

-- Migration from the previous Telegram-first schema.
ALTER TABLE users ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_id BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_first_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_last_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role user_role DEFAULT 'CUSTOMER';
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_site_visit_at TIMESTAMPTZ;
UPDATE users SET id = gen_random_uuid() WHERE id IS NULL;

DO $$
DECLARE current_pk TEXT;
BEGIN
  SELECT conname INTO current_pk FROM pg_constraint WHERE conrelid = 'users'::regclass AND contype = 'p' LIMIT 1;
  IF current_pk IS NOT NULL AND EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN unnest(c.conkey) AS k(attnum) ON TRUE
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    WHERE c.conrelid = 'users'::regclass AND c.contype = 'p' AND a.attname = 'telegram_id'
  ) THEN
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', current_pk);
  END IF;
END $$;

ALTER TABLE users ALTER COLUMN telegram_id DROP NOT NULL;
ALTER TABLE users ALTER COLUMN id SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'users'::regclass AND contype = 'p') THEN
    ALTER TABLE users ADD PRIMARY KEY (id);
  END IF;
END $$;

UPDATE users
SET telegram_username = COALESCE(telegram_username, username),
    avatar_url = COALESCE(avatar_url, photo_url),
    full_name = COALESCE(NULLIF(full_name, ''), NULLIF(profile_name, ''),
      NULLIF(trim(concat_ws(' ', telegram_first_name, telegram_last_name)), ''),
      'Пользователь MealPoint')
WHERE telegram_username IS NULL OR avatar_url IS NULL OR full_name IS NULL OR full_name = '';
CREATE UNIQUE INDEX IF NOT EXISTS users_uuid_unique_idx ON users(id);
CREATE UNIQUE INDEX IF NOT EXISTS users_telegram_id_unique_idx ON users(telegram_id) WHERE telegram_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_phone_idx ON users(phone);

CREATE TABLE IF NOT EXISTS customer_accounts (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone TEXT,
  password_hash TEXT NOT NULL DEFAULT '',
  terms_version TEXT NOT NULL DEFAULT '2026-08-13',
  terms_accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE customer_accounts ALTER COLUMN phone DROP NOT NULL;

CREATE TABLE IF NOT EXISTS phone_otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS phone_otp_codes_phone_idx ON phone_otp_codes(phone, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS customer_sessions_user_idx ON customer_sessions(user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS customer_sessions_expiry_idx ON customer_sessions(expires_at);

CREATE TABLE IF NOT EXISTS meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_date DATE NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT,
  allergens TEXT[],
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pickup_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude NUMERIC(10,7) NOT NULL,
  longitude NUMERIC(10,7) NOT NULL,
  instructions TEXT,
  working_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  status subscription_status NOT NULL DEFAULT 'PENDING_PAYMENT',
  selected_days INTEGER NOT NULL CHECK (selected_days > 0),
  remaining_portions INTEGER NOT NULL CHECK (remaining_portions >= 0),
  pause_limit INTEGER NOT NULL DEFAULT 0,
  pauses_used INTEGER NOT NULL DEFAULT 0,
  rate_thb INTEGER NOT NULL,
  total_thb INTEGER NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  qr_secret_hash TEXT NOT NULL DEFAULT '',
  account_access_hash TEXT,
  payment_method TEXT,
  paid_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  pickup_point_name TEXT,
  fulfillment_type TEXT NOT NULL DEFAULT 'PICKUP' CHECK (fulfillment_type IN ('PICKUP','DELIVERY')),
  customer_name TEXT,
  customer_phone TEXT,
  delivery_address TEXT,
  default_time TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS fulfillment_type TEXT NOT NULL DEFAULT 'PICKUP';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS default_time TEXT;
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions(status);
CREATE INDEX IF NOT EXISTS subscriptions_created_at_idx ON subscriptions(created_at DESC);

CREATE TABLE IF NOT EXISTS subscription_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  meal_id UUID REFERENCES meals(id),
  pickup_point_id UUID REFERENCES pickup_points(id),
  service_date DATE NOT NULL,
  status subscription_day_status NOT NULL DEFAULT 'PLANNED',
  pause_requested_at TIMESTAMPTZ,
  redeemed_at TIMESTAMPTZ,
  fulfillment_type TEXT NOT NULL DEFAULT 'PICKUP' CHECK (fulfillment_type IN ('PICKUP','DELIVERY')),
  requested_time TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  delivery_address TEXT,
  consumed_at TIMESTAMPTZ,
  delivery_received_at TIMESTAMPTZ,
  delivery_received_by TEXT,
  pickup_redeemed_point_name TEXT,
  UNIQUE(subscription_id, service_date)
);
ALTER TABLE subscription_days ADD COLUMN IF NOT EXISTS fulfillment_type TEXT NOT NULL DEFAULT 'PICKUP';
ALTER TABLE subscription_days ADD COLUMN IF NOT EXISTS requested_time TEXT;
ALTER TABLE subscription_days ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE subscription_days ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE subscription_days ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE subscription_days ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ;
ALTER TABLE subscription_days ADD COLUMN IF NOT EXISTS delivery_received_at TIMESTAMPTZ;
ALTER TABLE subscription_days ADD COLUMN IF NOT EXISTS delivery_received_by TEXT;
ALTER TABLE subscription_days ADD COLUMN IF NOT EXISTS pickup_redeemed_point_name TEXT;
CREATE INDEX IF NOT EXISTS subscription_days_subscription_date_idx ON subscription_days(subscription_id, service_date);
CREATE INDEX IF NOT EXISTS subscription_days_service_date_idx ON subscription_days(service_date, status);

CREATE TABLE IF NOT EXISTS subscription_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  subscription_day_id UUID NOT NULL REFERENCES subscription_days(id),
  pickup_point_id UUID REFERENCES pickup_points(id),
  device_id TEXT NOT NULL,
  token_nonce TEXT UNIQUE NOT NULL,
  result TEXT NOT NULL,
  pickup_point_name TEXT,
  portions_after INTEGER,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DELETE FROM subscription_scans newer
USING subscription_scans older
WHERE newer.result = 'REDEEMED'
  AND older.result = 'REDEEMED'
  AND newer.subscription_day_id = older.subscription_day_id
  AND (newer.scanned_at, newer.id) > (older.scanned_at, older.id);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_scans_one_redeem_day_idx
  ON subscription_scans(subscription_day_id)
  WHERE result = 'REDEEMED';

CREATE TABLE IF NOT EXISTS pickup_lock_states (
  point_code TEXT PRIMARY KEY,
  open_until TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  last_redeemed_subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  last_redeemed_subscription_day_id UUID REFERENCES subscription_days(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pickup_lock_states_seen_idx ON pickup_lock_states(last_seen_at DESC);

CREATE TABLE IF NOT EXISTS pickup_point_daily_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_date DATE NOT NULL,
  pickup_point_name TEXT NOT NULL,
  delivered_count INTEGER NOT NULL DEFAULT 0 CHECK (delivered_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(service_date, pickup_point_name)
);

CREATE TABLE IF NOT EXISTS app_runtime_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  test_mode BOOLEAN NOT NULL DEFAULT FALSE,
  test_datetime_local VARCHAR(16),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO app_runtime_settings (id, test_mode, test_datetime_local)
VALUES (1, FALSE, NULL) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS manager_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  payload JSONB NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS manager_events_pending_idx ON manager_events(created_at) WHERE acknowledged_at IS NULL;

CREATE TABLE IF NOT EXISTS staff_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL CHECK (role IN ('MANAGER','KITCHEN','COURIER')),
  username TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS staff_sessions_expiry_idx ON staff_sessions(expires_at);
CREATE INDEX IF NOT EXISTS staff_sessions_role_idx ON staff_sessions(role, expires_at DESC);

CREATE TABLE IF NOT EXISTS security_rate_limits (
  rate_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0 CHECK (hits >= 0),
  PRIMARY KEY (rate_key, window_start)
);
CREATE INDEX IF NOT EXISTS security_rate_limits_window_idx ON security_rate_limits(window_start);
