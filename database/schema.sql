-- MealPoint target PostgreSQL schema.
-- The visual MVP does not execute these tables yet; they define the next backend stage.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('CUSTOMER', 'ADMIN', 'MANAGER', 'PARTNER_OWNER', 'PARTNER_STAFF');
CREATE TYPE subscription_status AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');
CREATE TYPE subscription_day_status AS ENUM ('PLANNED', 'PAUSE_REQUESTED', 'PAUSED', 'AVAILABLE', 'REDEEMED', 'MISSED');
CREATE TYPE order_kind AS ENUM ('DELIVERY', 'PARTNER_DELIVERY');
CREATE TYPE order_status AS ENUM ('NEW', 'ACCEPTED', 'COOKING', 'READY', 'COURIER_ASSIGNED', 'ON_THE_WAY', 'DELIVERED', 'CANCELLED');

CREATE TABLE users (
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

CREATE TABLE restaurants (
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

CREATE TABLE restaurant_users (
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'PARTNER_STAFF',
  PRIMARY KEY (restaurant_id, user_id)
);

CREATE TABLE meals (
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

CREATE TABLE pickup_points (
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

CREATE TABLE subscriptions (
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE subscription_days (
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

CREATE TABLE subscription_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id),
  subscription_day_id uuid NOT NULL REFERENCES subscription_days(id),
  pickup_point_id uuid NOT NULL REFERENCES pickup_points(id),
  device_id text NOT NULL,
  token_nonce text UNIQUE NOT NULL,
  result text NOT NULL,
  scanned_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE menu_items (
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

CREATE TABLE orders (
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

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES menu_items(id),
  item_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_thb integer NOT NULL,
  line_total_thb integer NOT NULL
);

CREATE TABLE reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid UNIQUE NOT NULL REFERENCES orders(id),
  user_id uuid NOT NULL REFERENCES users(id),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id),
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE manager_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  entity_id uuid NOT NULL,
  payload jsonb NOT NULL,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX subscription_days_service_date_idx ON subscription_days(service_date, status);
CREATE INDEX orders_restaurant_status_idx ON orders(restaurant_id, status, created_at DESC);
CREATE INDEX manager_events_pending_idx ON manager_events(created_at) WHERE acknowledged_at IS NULL;

