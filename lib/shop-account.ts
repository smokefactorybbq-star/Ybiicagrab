import { query } from "./db";

export function loyaltyPercent(totalSpend: number) {
  if (totalSpend >= 20_000) return 20;
  if (totalSpend >= 15_000) return 15;
  if (totalSpend >= 10_000) return 10;
  if (totalSpend >= 5_000) return 5;
  return 0;
}

export async function getShopAccountData(telegramId: string) {
  const userResult = await query<any>(
    `SELECT u.*,
       COALESCE((SELECT SUM(o.total) FROM orders o WHERE o.telegram_id=u.telegram_id AND COALESCE(o.status,'created') <> 'cancelled'),0)::bigint AS order_spend,
       COALESCE((SELECT COUNT(*) FROM orders o WHERE o.telegram_id=u.telegram_id AND COALESCE(o.status,'created') <> 'cancelled'),0)::int AS orders_count
     FROM users u WHERE u.telegram_id=$1`,
    [telegramId]
  );
  const user = userResult.rows[0];
  if (!user) return null;

  const ordersResult = await query<any>(
    `SELECT o.id, o.order_number, o.created_at, o.total, o.items_total, o.delivery_fee,
            o.discount_percent, o.discount_amount, o.payment_method, o.customer_name,
            o.phone, o.address_plain, o.address, o.fulfillment_type,
            COALESCE(json_agg(json_build_object('name',oi.item_name,'qty',oi.quantity,'price',oi.unit_price,'img',oi.image_url) ORDER BY oi.id)
              FILTER (WHERE oi.id IS NOT NULL), '[]'::json) AS items
     FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id
     WHERE o.telegram_id=$1 AND COALESCE(o.status,'created') <> 'cancelled'
     GROUP BY o.id ORDER BY o.created_at DESC LIMIT 30`,
    [telegramId]
  );

  const orderSpend = Number(user.order_spend || 0);
  const manualSpend = Number(user.manual_spend || 0);
  const lifetimeSpend = Math.max(Number(user.lifetime_spend || 0), manualSpend, orderSpend + manualSpend);
  const balance = Math.max(0, Number(user.bonus_balance || 0));
  const cashbackPercent = loyaltyPercent(lifetimeSpend);

  return {
    profile: {
      telegramId: String(user.telegram_id),
      username: user.username || user.telegram_username || "",
      telegramFirstName: user.telegram_first_name || "",
      telegramLastName: user.telegram_last_name || "",
      name: user.profile_name || user.full_name || user.telegram_first_name || "",
      phone: user.phone || "",
      address: user.address || "",
      photoUrl: user.photo_url || user.avatar_url || ""
    },
    loyalty: {
      orderSpend,
      manualSpend,
      totalSpend: lifetimeSpend,
      lifetimeSpend,
      balance,
      bonusBalance: balance,
      cashbackPercent,
      discountPercent: cashbackPercent,
      maxRedeemPercent: 20,
      ordersCount: Number(user.orders_count || 0)
    },
    orders: ordersResult.rows
  };
}
