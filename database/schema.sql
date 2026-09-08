-- Smoke Factory BBQ ONLY.
-- This schema deliberately contains no MealPoint subscriptions, pickup locks or MealPoint staff tables.
-- It is compatible with the existing tgfoodbot / Mini App database where users.telegram_id is the primary key.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  telegram_id BIGINT PRIMARY KEY,
  username TEXT,
  telegram_first_name TEXT,
  telegram_last_name TEXT,
  profile_name TEXT,
  phone TEXT,
  address TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_bot_activity_at TIMESTAMPTZ,
  last_site_visit_at TIMESTAMPTZ,
  manual_spend BIGINT NOT NULL DEFAULT 0,
  bonus_balance INTEGER NOT NULL DEFAULT 0,
  lifetime_spend BIGINT NOT NULL DEFAULT 0
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_first_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_last_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_bot_activity_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_site_visit_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'CUSTOMER';
ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_allowed BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_send_error TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_successful_send_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_broadcast_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_keyboard_sent_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_updated_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_updated_by BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS manual_spend BIGINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_balance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS lifetime_spend BIGINT NOT NULL DEFAULT 0;
UPDATE users SET id=gen_random_uuid() WHERE id IS NULL;
UPDATE users SET
  telegram_username=COALESCE(telegram_username,username),
  avatar_url=COALESCE(avatar_url,photo_url),
  full_name=COALESCE(NULLIF(full_name,''),NULLIF(profile_name,''),NULLIF(trim(concat_ws(' ',telegram_first_name,telegram_last_name)),''),'Пользователь Smoke Factory')
WHERE telegram_username IS NULL OR avatar_url IS NULL OR full_name IS NULL OR full_name='';
CREATE UNIQUE INDEX IF NOT EXISTS users_uuid_unique_idx ON users(id);
CREATE UNIQUE INDEX IF NOT EXISTS users_telegram_id_unique_idx ON users(telegram_id);
CREATE INDEX IF NOT EXISTS users_phone_idx ON users(phone);

CREATE TABLE IF NOT EXISTS visits (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT REFERENCES users(telegram_id) ON DELETE SET NULL,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_key TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_visits_visited_at ON visits(visited_at);
CREATE INDEX IF NOT EXISTS idx_visits_telegram_id ON visits(telegram_id);

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT REFERENCES users(telegram_id) ON DELETE RESTRICT,
  source TEXT NOT NULL DEFAULT 'mini_app',
  customer_name TEXT,
  phone TEXT,
  address TEXT,
  address_plain TEXT,
  payment_method TEXT,
  delivery_fee INTEGER NOT NULL DEFAULT 0,
  items_total INTEGER NOT NULL DEFAULT 0,
  discount_percent INTEGER NOT NULL DEFAULT 0,
  discount_amount INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  order_when TEXT,
  order_date DATE,
  order_time TEXT,
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bonus_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cashback_percent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cashback_earned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS loyalty_request_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_type TEXT NOT NULL DEFAULT 'DELIVERY';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_latitude DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_longitude DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cutlery BOOLEAN;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS prep_minutes INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS route_minutes INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_receipt_received_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_receipt_file_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_receipt_type TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_reminder_sent_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_url TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number) WHERE order_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_loyalty_request_id ON orders(loyalty_request_id) WHERE loyalty_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_telegram_id ON orders(telegram_id);

DO $order_number_sequence$
DECLARE max_existing_number BIGINT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relkind='S' AND relname='sm_order_number_seq') THEN
    CREATE SEQUENCE sm_order_number_seq START WITH 472 INCREMENT BY 1 MINVALUE 1 NO MAXVALUE CACHE 1;
    SELECT COALESCE(MAX(CASE WHEN order_number ~ '^SM-[0-9]+$' THEN SUBSTRING(order_number FROM 4)::BIGINT END),471)
      INTO max_existing_number FROM orders;
    PERFORM setval('sm_order_number_seq',GREATEST(max_existing_number,471),TRUE);
  END IF;
END
$order_number_sequence$;

CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  image_url TEXT
);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

CREATE TABLE IF NOT EXISTS loyalty_adjustments (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT UNIQUE,
  telegram_id BIGINT NOT NULL,
  previous_amount BIGINT NOT NULL DEFAULT 0,
  new_amount BIGINT NOT NULL DEFAULT 0,
  created_by BIGINT,
  source TEXT NOT NULL DEFAULT 'manager_bonus',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_adjustments_user ON loyalty_adjustments(telegram_id);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  telegram_id BIGINT NOT NULL,
  order_ref TEXT NOT NULL,
  items_total INTEGER NOT NULL,
  delivery_fee INTEGER NOT NULL DEFAULT 0,
  bonus_used INTEGER NOT NULL DEFAULT 0,
  cashback_percent INTEGER NOT NULL DEFAULT 0,
  cashback_earned INTEGER NOT NULL DEFAULT 0,
  balance_before INTEGER NOT NULL DEFAULT 0,
  balance_after INTEGER NOT NULL DEFAULT 0,
  lifetime_spend_before BIGINT NOT NULL DEFAULT 0,
  lifetime_spend_after BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_user ON loyalty_transactions(telegram_id,created_at DESC);

CREATE TABLE IF NOT EXISTS customer_accounts (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone TEXT,
  password_hash TEXT NOT NULL DEFAULT '',
  terms_version TEXT NOT NULL DEFAULT '2026-09-08',
  terms_accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE customer_accounts ALTER COLUMN phone DROP NOT NULL;
CREATE TABLE IF NOT EXISTS customer_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS customer_sessions_user_idx ON customer_sessions(user_id,expires_at DESC);
CREATE INDEX IF NOT EXISTS customer_sessions_expiry_idx ON customer_sessions(expires_at);

CREATE TABLE IF NOT EXISTS security_rate_limits (
  rate_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0 CHECK (hits >= 0),
  PRIMARY KEY(rate_key,window_start)
);
CREATE INDEX IF NOT EXISTS security_rate_limits_window_idx ON security_rate_limits(window_start);
