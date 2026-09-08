import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAccount } from "../../../../lib/auth";
import { authoritativePrice } from "../../../../lib/shop-menu";
import { loyaltyPercent } from "../../../../lib/shop-account";
import { withTransaction } from "../../../../lib/db";
import { notifyManagerTelegram } from "../../../../lib/telegram";
import { deliveryFeeForDistrict } from "../../../../lib/delivery";
import { clientIp, consumeRateLimit } from "../../../../lib/rate-limit";
import { isSameOriginMutation } from "../../../../lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClientItem = { qty?: unknown; price?: unknown; img?: unknown };
type OrderBody = {
  items?: unknown;
  phone?: unknown;
  name?: unknown;
  address?: unknown;
  address_plain?: unknown;
  comment?: unknown;
  deliveryDistrict?: unknown;
  bonusRequested?: unknown;
  orderRequestId?: unknown;
  orderDate?: unknown;
  orderTime?: unknown;
  orderWhen?: unknown;
  payMethod?: unknown;
  fulfillmentType?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  location?: unknown;
  cutlery?: unknown;
};

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function int(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c] || c));
}
function coordinates(body: OrderBody) {
  const loc = body.location && typeof body.location === "object" ? body.location as Record<string, unknown> : null;
  const lat = Number(body.latitude ?? loc?.lat);
  const lng = Number(body.longitude ?? loc?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
function paymentMethod(value: unknown) {
  const raw = text(value, 80).toLowerCase().replace(/[ _-]/g, "");
  if (["promptpay", "promtpay", "thaibank", "thai"].includes(raw)) return "PromptPay";
  if (["cash", "наличные", "кэш"].includes(raw)) return "Cash";
  if (["банкрф", "bankrf", "russianbank"].includes(raw)) return "Банк РФ";
  return "PromptPay";
}
function validateScheduled(orderWhen: string | null, orderDate: string | null, orderTime: string | null) {
  if (orderWhen !== "scheduled") return true;
  if (!orderDate || !/^\d{4}-\d{2}-\d{2}$/.test(orderDate || "") || !orderTime || !/^\d{2}:\d{2}$/.test(orderTime)) return false;
  const target = new Date(`${orderDate}T${orderTime}:00+07:00`).getTime();
  return Number.isFinite(target) && target >= Date.now() + 60 * 60 * 1000;
}

function preparationMinutes(items: Array<{ name: string; qty: number }>) {
  const timeFor = (name: string) => {
    const n = name.toLowerCase();
    if (["борщ", "солянка", "гороховый суп", "грибной суп", "окрошка", "куриный суп"].some((x) => n.includes(x))) return 10;
    if (n.includes("салат") || n.includes("цезарь") || n.includes("обжор") || n.includes("столич") || n.includes("деревен") || n.includes("баклаж")) return 15;
    if (n.includes("пельмен") || n.includes("вареник")) return 20;
    if (n.includes("лепеш")) return 16;
    if (n.includes("киев")) return 22;
    if (n.includes("чебур")) return 20;
    if (n.includes("фри") || n.includes("дольк")) return 16;
    if (n.includes("зраз") || n.includes("драник")) return 24;
    if (n.includes("ребр") || n.includes("рёбр")) return 12;
    if (n.includes("шашлык из курицы") || n.includes("кебаб из курицы")) return 28;
    if (n.includes("шашлык") || n.includes("кебаб") || n.includes("крыл")) return 30;
    if (n.includes("котлет") || n.includes("перец") || n.includes("беф") || n.includes("голуб")) return 13;
    return 13;
  };
  const maxDish = items.reduce((max, item) => Math.max(max, timeFor(item.name)), 5);
  return maxDish + 10;
}

async function fallbackToScreen(payload: Record<string, unknown>, items: Array<{ name: string; qty: number }>) {
  const defaultScreenBase = "https://screegrab-production.up.railway.app";
  const configured = (process.env.SCREEN_SERVICE_URL || "").replace(/\/+$/, "");
  const screenBases = Array.from(new Set([configured, defaultScreenBase].filter(Boolean)));
  const secret = (process.env.SCREEN_SERVICE_SECRET || "").trim();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["X-Screen-Secret"] = secret;
  let lastError = "Screen unavailable";
  for (const screenBase of screenBases) {
    try {
      const response = await fetch(`${screenBase}/api/external-order`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          orderNo: payload.order_number || payload.orderNumber,
          prepMinutes: preparationMinutes(items),
          items,
          cutlery: payload.cutlery ?? null,
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (response.ok) return true;
      lastError = `Screen HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Screen unavailable";
    }
  }
  throw new Error(lastError);
}

export async function POST(request: NextRequest) {
  try {
    if (!isSameOriginMutation(request)) {
      return NextResponse.json({ ok: false, error: "Недопустимый источник запроса" }, { status: 403 });
    }
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 250_000) {
      return NextResponse.json({ ok: false, error: "Слишком большой запрос" }, { status: 413 });
    }

    const account = await getAuthenticatedAccount(request);
    if (!account) {
      return NextResponse.json({ ok: false, error: "Чтобы заказать, войдите через Telegram" }, { status: 401 });
    }

    const body = await request.json() as OrderBody;
    const fulfillmentType = body.fulfillmentType === "PICKUP" ? "PICKUP" : "DELIVERY";
    const customerName = text(body.name, 120);
    const phone = text(body.phone, 30).replace(/[\s()-]/g, "");
    const addressPlain = fulfillmentType === "PICKUP" ? "Самовывоз" : text(body.address_plain, 500);
    const address = fulfillmentType === "PICKUP" ? "Самовывоз Smoke Factory BBQ" : (text(body.address, 800) || addressPlain);
    const comment = text(body.comment, 1000);
    const payment = paymentMethod(body.payMethod);
    const orderDate = text(body.orderDate, 10) || null;
    const rawOrderTime = text(body.orderTime, 20);
    const orderWhen = text(body.orderWhen, 30) === "scheduled" ? "scheduled" : "asap";
    const orderTime = orderWhen === "scheduled" ? rawOrderTime : null;
    const point = coordinates(body);
    const cutlery = typeof body.cutlery === "boolean" ? body.cutlery : null;

    if (customerName.length < 2) return NextResponse.json({ ok: false, error: "Введите имя" }, { status: 400 });
    if (!/^\+66\d{9,10}$/.test(phone)) return NextResponse.json({ ok: false, error: "Проверьте телефон. Формат: +66XXXXXXXXX" }, { status: 400 });
    if (fulfillmentType === "DELIVERY" && addressPlain.length < 4) return NextResponse.json({ ok: false, error: "Введите адрес доставки" }, { status: 400 });
    if (fulfillmentType === "DELIVERY" && payment === "Cash") return NextResponse.json({ ok: false, error: "Наличными можно оплатить только самовывоз" }, { status: 400 });
    if (!validateScheduled(orderWhen, orderDate, orderTime)) {
      return NextResponse.json({ ok: false, error: "Заказ ко времени можно поставить минимум через 1 час" }, { status: 400 });
    }

    const sourceItems = body.items && typeof body.items === "object" && !Array.isArray(body.items)
      ? body.items as Record<string, ClientItem>
      : {};
    const items: Array<{ name: string; qty: number; price: number; img: string }> = [];
    for (const [rawName, rawInfo] of Object.entries(sourceItems)) {
      const name = text(rawName, 180);
      const serverPrice = authoritativePrice(name);
      if (serverPrice === null) return NextResponse.json({ ok: false, error: `Неизвестное блюдо: ${name}` }, { status: 400 });
      const qty = int(rawInfo?.qty, 0);
      if (qty < 1 || qty > 50) return NextResponse.json({ ok: false, error: `Некорректное количество: ${name}` }, { status: 400 });
      items.push({ name, qty, price: serverPrice, img: text(rawInfo?.img, 500) });
    }
    if (!items.length) return NextResponse.json({ ok: false, error: "Корзина пуста" }, { status: 400 });

    const itemsTotal = items.reduce((sum, item) => sum + item.qty * item.price, 0);
    const deliveryInfo = fulfillmentType === "PICKUP" ? { district: "PICKUP", fee: 0 } : deliveryFeeForDistrict(body.deliveryDistrict);
    if (!deliveryInfo) return NextResponse.json({ ok: false, error: "Выберите район доставки" }, { status: 400 });
    const deliveryFee = deliveryInfo.fee;

    const ip = clientIp(request);
    const ipLimit = await consumeRateLimit(`order-ip:${ip}`, 12, 10 * 60);
    const phoneLimit = await consumeRateLimit(`order-phone:${phone}`, 8, 30 * 60);
    if (!ipLimit.allowed || !phoneLimit.allowed) {
      const retryAfter = Math.max(ipLimit.retryAfterSeconds, phoneLimit.retryAfterSeconds);
      return NextResponse.json({ ok: false, error: "Слишком много заказов за короткое время. Попробуйте позже." }, {
        status: 429, headers: { "Retry-After": String(retryAfter) },
      });
    }

    const requestedBonus = Math.max(0, int(body.bonusRequested, 0));
    const requestId = text(body.orderRequestId, 160) || `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const saved = await withTransaction(async (client) => {
      const existingOrder = await client.query<{
        id: string; order_number: string; total: number; bonus_used: number; cashback_percent: number; cashback_earned: number;
      }>(
        `SELECT id::text,order_number,total,bonus_used,cashback_percent,cashback_earned
         FROM orders WHERE loyalty_request_id=$1 LIMIT 1 FOR UPDATE`,
        [requestId]
      );
      if (existingOrder.rowCount) {
        const row = existingOrder.rows[0];
        return {
          id: row.id, orderNumber: row.order_number, total: Number(row.total || 0), bonusUsed: Number(row.bonus_used || 0),
          cashbackPercent: Number(row.cashback_percent || 0), cashbackEarned: Number(row.cashback_earned || 0), balanceAfter: 0, idempotent: true,
        };
      }

      const userResult = await client.query<{
        bonus_balance: number; lifetime_spend: string; manual_spend: string; order_spend: string;
      }>(
        `SELECT u.bonus_balance, u.lifetime_spend, u.manual_spend,
           COALESCE((SELECT SUM(o.total) FROM orders o WHERE o.telegram_id=u.telegram_id AND COALESCE(o.status,'created') <> 'cancelled'),0)::bigint AS order_spend
         FROM users u WHERE u.telegram_id=$1 FOR UPDATE`,
        [account.telegramId]
      );
      const user = userResult.rows[0];
      if (!user) throw new Error("ACCOUNT_NOT_FOUND");
      const balanceBefore = Math.max(0, Number(user.bonus_balance || 0));
      const spendBefore = Math.max(Number(user.lifetime_spend || 0), Number(user.manual_spend || 0), Number(user.order_spend || 0) + Number(user.manual_spend || 0));
      const cashbackPercent = loyaltyPercent(spendBefore);
      const bonusUsed = Math.min(requestedBonus, balanceBefore, Math.floor(itemsTotal * 0.20));
      const cashbackBase = Math.max(0, itemsTotal - bonusUsed);
      const cashbackEarned = Math.floor(cashbackBase * cashbackPercent / 100);
      const balanceAfter = Math.max(0, balanceBefore - bonusUsed + cashbackEarned);
      const lifetimeAfter = spendBefore + cashbackBase;
      await client.query(`UPDATE users SET bonus_balance=$2,lifetime_spend=$3,updated_at=now() WHERE telegram_id=$1`, [account.telegramId, balanceAfter, lifetimeAfter]);
      await client.query(
        `INSERT INTO loyalty_transactions (
           request_id,telegram_id,order_ref,items_total,delivery_fee,bonus_used,cashback_percent,cashback_earned,
           balance_before,balance_after,lifetime_spend_before,lifetime_spend_after
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (request_id) DO NOTHING`,
        [`web:${account.telegramId}:${requestId}`, account.telegramId, requestId, itemsTotal, deliveryFee, bonusUsed, cashbackPercent, cashbackEarned,
          balanceBefore, balanceAfter, spendBefore, lifetimeAfter]
      );

      const total = Math.max(0, itemsTotal - bonusUsed + deliveryFee);
      const orderNumber = `SM-${await client.query<{ n: string }>(`SELECT nextval('sm_order_number_seq')::text AS n`).then((r) => r.rows[0].n)}`;
      const order = await client.query<{ id: string }>(
        `INSERT INTO orders (
           order_number,telegram_id,source,customer_name,phone,address,address_plain,payment_method,
           delivery_fee,items_total,discount_percent,discount_amount,bonus_used,cashback_percent,cashback_earned,
           total,order_when,order_date,order_time,comment,status,fulfillment_type,loyalty_request_id,
           customer_latitude,customer_longitude,cutlery
         ) VALUES ($1,$2,'website',$3,$4,$5,$6,$7,$8,$9,0,$10,$10,$11,$12,$13,$14,$15,$16,$17,'created',$18,$19,$20,$21,$22)
         RETURNING id::text`,
        [orderNumber, account.telegramId, customerName, phone, address, addressPlain, payment,
          deliveryFee, itemsTotal, bonusUsed, cashbackPercent, cashbackEarned, total, orderWhen, orderDate, orderTime, comment,
          fulfillmentType, requestId, point?.lat ?? null, point?.lng ?? null, cutlery]
      );
      for (const item of items) {
        await client.query(
          `INSERT INTO order_items (order_id,item_name,quantity,unit_price,image_url) VALUES ($1,$2,$3,$4,$5)`,
          [order.rows[0].id, item.name, item.qty, item.price, item.img || null]
        );
      }
      return { id: order.rows[0].id, orderNumber, total, bonusUsed, cashbackPercent, cashbackEarned, balanceAfter, idempotent: false };
    });

    if (saved.idempotent) {
      return NextResponse.json({ ok: true, orderId: saved.id, orderNumber: saved.orderNumber, total: saved.total, idempotent: true });
    }

    const botOrderUrl = (process.env.TELEGRAM_BOT_ORDER_URL || "").trim();
    const websiteOrderSecret = (process.env.WEBSITE_ORDER_SECRET || "").trim();
    let botDelivered = false;
    let botError = "";

    const botPayload = {
      order_number: saved.orderNumber,
      orderNumber: saved.orderNumber,
      website_order_id: saved.id,
      telegram_id: account.telegramId,
      name: customerName,
      phone,
      address,
      address_plain: addressPlain,
      customer_latitude: point?.lat ?? null,
      customer_longitude: point?.lng ?? null,
      delivery: deliveryFee,
      payment,
      items,
      items_total: itemsTotal,
      bonus_used: saved.bonusUsed,
      cashback_percent: saved.cashbackPercent,
      cashback_earned: saved.cashbackEarned,
      total: saved.total,
      order_date: orderDate,
      order_time: orderTime,
      order_when: orderWhen,
      comment,
      cutlery,
      fulfillment_type: fulfillmentType,
      delivery_district: deliveryInfo.district,
      source: "website",
      receipt_expected: payment === "PromptPay",
    };

    if (botOrderUrl) {
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (websiteOrderSecret) headers["X-Website-Order-Secret"] = websiteOrderSecret;
        const response = await fetch(botOrderUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(botPayload),
          signal: AbortSignal.timeout(35_000),
        });
        botDelivered = response.ok;
        if (!response.ok) botError = `Bot HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`;
      } catch (error) {
        botError = error instanceof Error ? error.message : "Bot unavailable";
      }
    } else {
      botError = "TELEGRAM_BOT_ORDER_URL not configured";
    }

    // The main bot is still the primary path. If it is temporarily unavailable,
    // put the already-saved order on the kitchen/courier screens so the kitchen
    // does not lose it. The screen endpoint is idempotent by order number.
    let screenFallbackDelivered = false;
    if (!botDelivered) {
      try {
        screenFallbackDelivered = await fallbackToScreen(botPayload as unknown as Record<string, unknown>, items);
      } catch (screenError) {
        console.error("Screen fallback failed", screenError);
      }
    }

    if (!botDelivered) {
      const itemLines = items.map((i) => `• ${escapeHtml(i.name)} ×${i.qty}`).join("\n");
      void notifyManagerTelegram({ text: [
        `⚠️ <b>${escapeHtml(saved.orderNumber)}</b> сохранён, но tgfoodbot не подтвердил обработку.`,
        `Ошибка: ${escapeHtml(botError)}`,
        `Клиент: ${escapeHtml(customerName)} ${escapeHtml(phone)}`,
        itemLines,
        `<b>Итого: ${saved.total} ฿</b>`,
      ].join("\n") });
    }

    return NextResponse.json({
      ok: true,
      orderNumber: saved.orderNumber,
      total: saved.total,
      bonusUsed: saved.bonusUsed,
      cashbackEarned: saved.cashbackEarned,
      bonusBalance: saved.balanceAfter,
      botDelivered,
      screenFallbackDelivered,
      warning: botDelivered ? null : (screenFallbackDelivered
        ? "Заказ сохранён и отправлен на экраны. tgfoodbot временно не подтвердил полную обработку."
        : "Заказ сохранён. Менеджер уведомлён, потому что бот временно не подтвердил обработку."),
    }, { status: 201 });
  } catch (error) {
    console.error("Website order failed", error);
    return NextResponse.json({ ok: false, error: "Не удалось оформить заказ. Попробуйте ещё раз или напишите менеджеру." }, { status: 500 });
  }
}
