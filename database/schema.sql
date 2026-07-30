-- MealPoint PostgreSQL schema.
-- Idempotent: it can safely run on every Railway service start.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('CUSTOMER', 'ADMIN', 'MANAGER', 'PARTNER_OWNER', 'PARTNER_STAFF');
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

DO $$ BEGIN
  CREATE TYPE order_kind AS ENUM ('DELIVERY', 'PARTNER_DELIVERY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('NEW', 'ACCEPTED', 'COOKING', 'READY', 'COURIER_ASSIGNED', 'ON_THE_WAY', 'DELIVERED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint UNIQUE,
  telegram_username text,
  full_name text NOT NULL,
  phone text,
  avatar_url text,
  role user_role NOT NULL DEFAULT 'CUSTOMER',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS restaurants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  logo_url text,
  cover_url text,
  phone text,
  address text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  working_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS restaurant_users (
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'PARTNER_STAFF',
  PRIMARY KEY (restaurant_id, user_id)
);

CREATE TABLE IF NOT EXISTS meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_date date NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  image_url text,
  allergens text[],
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(service_date)
);

CREATE TABLE IF NOT EXISTS pickup_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL,
  latitude numeric(10,7) NOT NULL,
  longitude numeric(10,7) NOT NULL,
  instructions text,
  working_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  status subscription_status NOT NULL DEFAULT 'PENDING_PAYMENT',
  selected_days integer NOT NULL CHECK (selected_days > 0),
  remaining_portions integer NOT NULL CHECK (remaining_portions >= 0),
  pause_limit integer NOT NULL DEFAULT 0,
  pauses_used integer NOT NULL DEFAULT 0,
  rate_thb integer NOT NULL,
  total_thb integer NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  qr_secret_hash text NOT NULL,
  account_access_hash text,
  payment_method text,
  paid_at timestamptz,
  activated_at timestamptz,
  pickup_point_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS pickup_point_name text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS account_access_hash text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS activated_at timestamptz;

CREATE TABLE IF NOT EXISTS subscription_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  meal_id uuid REFERENCES meals(id),
  pickup_point_id uuid REFERENCES pickup_points(id),
  service_date date NOT NULL,
  status subscription_day_status NOT NULL DEFAULT 'PLANNED',
  pause_requested_at timestamptz,
  redeemed_at timestamptz,
  UNIQUE(subscription_id, service_date)
);

CREATE TABLE IF NOT EXISTS subscription_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id),
  subscription_day_id uuid NOT NULL REFERENCES subscription_days(id),
  pickup_point_id uuid REFERENCES pickup_points(id),
  device_id text NOT NULL,
  token_nonce text UNIQUE NOT NULL,
  result text NOT NULL,
  pickup_point_name text,
  portions_after integer,
  scanned_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscription_scans ALTER COLUMN pickup_point_id DROP NOT NULL;
ALTER TABLE subscription_scans ADD COLUMN IF NOT EXISTS pickup_point_name text;
ALTER TABLE subscription_scans ADD COLUMN IF NOT EXISTS portions_after integer;
CREATE INDEX IF NOT EXISTS subscription_scans_subscription_idx ON subscription_scans(subscription_id, scanned_at DESC);

CREATE TABLE IF NOT EXISTS menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  image_url text,
  price_thb integer NOT NULL CHECK (price_thb >= 0),
  category text,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_number text UNIQUE NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  restaurant_id uuid REFERENCES restaurants(id),
  kind order_kind NOT NULL DEFAULT 'DELIVERY',
  status order_status NOT NULL DEFAULT 'NEW',
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  address text NOT NULL,
  map_url text,
  district text,
  delivery_fee_thb integer NOT NULL DEFAULT 0,
  subtotal_thb integer NOT NULL,
  total_thb integer NOT NULL,
  payment_method text NOT NULL,
  requested_for timestamptz,
  preparation_minutes integer,
  estimated_delivery_at timestamptz,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES menu_items(id),
  item_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_thb integer NOT NULL,
  line_total_thb integer NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid UNIQUE NOT NULL REFERENCES orders(id),
  user_id uuid NOT NULL REFERENCES users(id),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id),
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS manager_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  entity_id uuid NOT NULL,
  payload jsonb NOT NULL,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_phone_idx ON users(phone);
CREATE INDEX IF NOT EXISTS subscription_days_service_date_idx ON subscription_days(service_date, status);
CREATE INDEX IF NOT EXISTS subscriptions_created_at_idx ON subscriptions(created_at DESC);
CREATE INDEX IF NOT EXISTS orders_restaurant_status_idx ON orders(restaurant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS manager_events_pending_idx ON manager_events(created_at) WHERE acknowledged_at IS NULL;

-- Weekly kitchen dashboard indexes.
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions(status);
CREATE INDEX IF NOT EXISTS subscription_days_subscription_date_idx ON subscription_days(subscription_id, service_date);

-- Daily pickup-point inventory — v0.5.1.
-- If no manual value exists, the manager dashboard uses today's active subscription plan.
CREATE TABLE IF NOT EXISTS pickup_point_daily_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_date date NOT NULL,
  pickup_point_name text NOT NULL,
  delivered_count integer NOT NULL DEFAULT 0 CHECK (delivered_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(service_date, pickup_point_name)
);

CREATE INDEX IF NOT EXISTS pickup_point_daily_inventory_date_idx
  ON pickup_point_daily_inventory(service_date, pickup_point_name);

-- Customer accounts, cross-device login and pickup delivery requests — v0.6.0.
ALTER TABLE users ADD COLUMN IF NOT EXISTS address text;

CREATE TABLE IF NOT EXISTS customer_accounts (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  terms_version text NOT NULL DEFAULT '2026-07-30',
  terms_accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_sessions_user_idx ON customer_sessions(user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS customer_sessions_expiry_idx ON customer_sessions(expires_at);

CREATE TABLE IF NOT EXISTS pickup_delivery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_token text UNIQUE NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  service_date date NOT NULL,
  pickup_point_name text NOT NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  delivery_address text NOT NULL,
  delivery_type text NOT NULL CHECK (delivery_type IN ('ASAP', 'SCHEDULED')),
  requested_time text,
  status text NOT NULL DEFAULT 'NEW',
  telegram_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(subscription_id, service_date)
);
CREATE INDEX IF NOT EXISTS pickup_delivery_requests_user_idx
  ON pickup_delivery_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pickup_delivery_requests_status_idx
  ON pickup_delivery_requests(status, created_at DESC);
